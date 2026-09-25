'use client';

import { useState, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  reportFieldExecution,
  attachFieldEvidence,
  FieldReportResult,
} from '@/lib/fieldWorkflowExecutionService';
import { OperationalResourceItem } from '@/lib/resourceConsumptionControlService';
import { LocalEvidenceFile } from '../EvidenceCapture';
import { generateUUID } from '@/lib/offlineDB';

export type SubmissionStep =
  | 'IDLE'
  | 'PREPARING_EVIDENCE'
  | 'SUBMITTING_RPC'
  | 'UPLOADING_EVIDENCE'
  | 'PERSISTED_SUCCESS'
  | 'ERROR';

export interface SubmitFieldReportParams {
  supabase: SupabaseClient;
  weeklyPlanItemId: string;
  boardId: string;
  groupId?: string;
  executionDate: string;
  executedQty: number;
  workerCount: number;
  hoursWorked: number;
  reportedBy?: string;
  usedResources?: OperationalResourceItem[];
  continuationDecision: 'CONTINUA_MANANA' | 'TERMINADA_HOY';
  beforePhoto?: LocalEvidenceFile | null;
  afterPhoto?: LocalEvidenceFile | null;
  notes?: string;
}

export function useFieldExecutionMutation() {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep>('IDLE');
  const [stepLabel, setStepLabel] = useState<string>('Listo para registrar');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FieldReportResult | null>(null);

  // Ref estable para source_mutation_id durante la misma sesión de reporte / reintentos
  const activeMutationIdRef = useRef<string | null>(null);

  const getOrCreateMutationId = useCallback((): string => {
    if (!activeMutationIdRef.current) {
      activeMutationIdRef.current = `mut_ui_${generateUUID()}_${Date.now()}`;
    }
    return activeMutationIdRef.current;
  }, []);

  const resetMutation = useCallback(() => {
    activeMutationIdRef.current = null;
    setError(null);
    setResult(null);
    setIsSubmitting(false);
    setSubmissionStep('IDLE');
    setStepLabel('Listo para registrar');
  }, []);

  const submitReport = useCallback(
    async (params: SubmitFieldReportParams): Promise<FieldReportResult> => {
      const {
        supabase,
        weeklyPlanItemId,
        boardId,
        groupId,
        executionDate,
        executedQty,
        workerCount,
        hoursWorked,
        reportedBy,
        usedResources = [],
        continuationDecision,
        beforePhoto,
        afterPhoto,
      } = params;

      setIsSubmitting(true);
      setError(null);
      setSubmissionStep('SUBMITTING_RPC');
      setStepLabel('Registrando avance físico en servidor...');

      try {
        if (!reportedBy) {
          throw new Error('Usuario no autenticado para registrar avances de campo');
        }

        const stableMutationId = getOrCreateMutationId();

        // 1. Enviar reporte físico al Gateway F5.3 (Idempotencia garantizada por source_mutation_id)
        const reportResult = await reportFieldExecution(supabase, {
          weekly_plan_item_id: weeklyPlanItemId,
          board_id: boardId,
          group_id: groupId,
          execution_date: executionDate,
          executed_qty: executedQty,
          worker_count: workerCount,
          hours_worked: hoursWorked,
          reported_by: reportedBy,
          source_mutation_id: stableMutationId,
          used_resources: usedResources,
          continuation_decision: continuationDecision,
        });

        const executionId = reportResult.executionRecord.id;

        // 2. Subir evidencias fotográficas de manera desacoplada si están presentes
        if (reportedBy && executionId) {
          // 2.1 Foto Antes
          if (beforePhoto?.file) {
            setSubmissionStep('UPLOADING_EVIDENCE');
            setStepLabel('Subiendo foto ANTES...');
            const fileExt = beforePhoto.file.name.split('.').pop() || 'jpg';
            const storagePath = `execution/${executionId}/before_${Date.now()}.${fileExt}`;

            const { error: upErr } = await supabase.storage
              .from('attachments')
              .upload(storagePath, beforePhoto.file, { upsert: true });

            if (upErr) {
              throw new Error(`Fallo al subir foto ANTES: ${upErr.message}`);
            }

            await attachFieldEvidence(supabase, {
              executionId,
              boardId,
              userId: reportedBy,
              storagePath,
              fileType: beforePhoto.file.type || 'image/jpeg',
              phase: 'before',
            });
          }

          // 2.2 Foto Después
          if (afterPhoto?.file) {
            setSubmissionStep('UPLOADING_EVIDENCE');
            setStepLabel('Subiendo foto DESPUÉS...');
            const fileExt = afterPhoto.file.name.split('.').pop() || 'jpg';
            const storagePath = `execution/${executionId}/after_${Date.now()}.${fileExt}`;

            const { error: upErr } = await supabase.storage
              .from('attachments')
              .upload(storagePath, afterPhoto.file, { upsert: true });

            if (upErr) {
              throw new Error(`Fallo al subir foto DESPUÉS: ${upErr.message}`);
            }

            await attachFieldEvidence(supabase, {
              executionId,
              boardId,
              userId: reportedBy,
              storagePath,
              fileType: afterPhoto.file.type || 'image/jpeg',
              phase: 'after',
            });
          }
        }

        setSubmissionStep('PERSISTED_SUCCESS');
        setStepLabel('Ejecución registrada con éxito');
        setResult(reportResult);
        return reportResult;
      } catch (err: any) {
        setSubmissionStep('ERROR');
        setStepLabel('Error en el registro');
        const msg = err?.message || 'Error al reportar avance físico de campo';
        setError(msg);
        setResult(null);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [getOrCreateMutationId]
  );

  return {
    submitReport,
    isSubmitting,
    submissionStep,
    stepLabel,
    error,
    result,
    isIdempotentReplay: result?.isIdempotentReplay ?? false,
    activeMutationId: activeMutationIdRef.current,
    resetMutation,
  };
}

export default useFieldExecutionMutation;
