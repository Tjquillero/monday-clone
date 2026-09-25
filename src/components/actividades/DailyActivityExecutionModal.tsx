'use client';

// Componente Nivel 3: Modal de Registro de Ejecución y Evidencia Fotográfica (/my-work)
// Adaptado a viewport móvil dinámico (92dvh, safe areas, sin solapamiento de sticky footer).
// Formulario de avance, insumos/equipos, fotos Antes/Después y confirmación explícita.

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2, Camera } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import { PublishedWeekPlanItem } from '@/hooks/useWeeklyPlans';
import { OperationalResourceItem } from '@/lib/resourceConsumptionControlService';
import ExecutionForm from './ExecutionForm';
import OperationalResourcePicker from './OperationalResourcePicker';
import EvidenceCapture, { LocalEvidenceFile } from './EvidenceCapture';
import useFieldExecutionMutation from './hooks/useFieldExecutionMutation';
import { FieldReportResult } from '@/lib/fieldWorkflowExecutionService';
import { getBogotaToday } from '@/lib/weeklyPlanner';

interface DailyActivityExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: FieldReportResult) => void;
  item: PublishedWeekPlanItem;
  boardId: string;
  groupId?: string;
  userId?: string;
  supabase?: SupabaseClient;
  executionDate?: string;
}

export const DailyActivityExecutionModal: React.FC<DailyActivityExecutionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  item,
  boardId,
  groupId,
  userId,
  supabase,
  executionDate = getBogotaToday().toISOString().substring(0, 10),
}) => {
  // Form State
  const [executedQty, setExecutedQty] = useState<number>(0);
  const [workerCount, setWorkerCount] = useState<number>(1);
  const [hoursWorked, setHoursWorked] = useState<number>(8);
  const [continuationDecision, setContinuationDecision] = useState<'CONTINUA_MANANA' | 'TERMINADA_HOY'>('CONTINUA_MANANA');
  const [notes, setNotes] = useState<string>('');

  // Resource & Evidence State
  const [usedResources, setUsedResources] = useState<OperationalResourceItem[]>([]);
  const [beforePhoto, setBeforePhoto] = useState<LocalEvidenceFile | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<LocalEvidenceFile | null>(null);

  const {
    submitReport,
    isSubmitting,
    submissionStep,
    stepLabel,
    error,
    result,
    isIdempotentReplay,
    resetMutation,
  } = useFieldExecutionMutation();

  // Reset form when modal opens with consultive crew size preload (PO-01)
  useEffect(() => {
    if (isOpen) {
      const initialWorkerCount =
        item.crew?.members_count && item.crew.members_count > 0
          ? item.crew.members_count
          : 1;

      setExecutedQty(0);
      setWorkerCount(initialWorkerCount);
      setHoursWorked(8);
      setContinuationDecision('CONTINUA_MANANA');
      setNotes('');
      setUsedResources([]);
      setBeforePhoto(null);
      setAfterPhoto(null);
      resetMutation();
    }
  }, [isOpen, item.crew?.members_count, resetMutation]);

  if (!isOpen) return null;

  const taskName = item.standard?.name || item.name || item.activity_key;
  const contractualUnit = item.unit || 'und';
  const plannedQty = item.planned_qty || 0;
  const previouslyReportedQty = item.executed_qty || 0;
  const previouslyVerifiedQty = (item as any).verified_qty || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (executedQty <= 0 || isSubmitting) {
      return;
    }

    try {
      let client = supabase;
      if (!client) {
        try {
          const { supabase: defaultClient } = require('@/lib/supabaseClient');
          client = defaultClient;
        } catch {
          client = {} as any;
        }
      }

      const res = await submitReport({
        supabase: client as any,
        weeklyPlanItemId: item.id,
        boardId,
        groupId: groupId || (item as any).group_id,
        executionDate: typeof executionDate === 'string' ? executionDate : String(executionDate),
        executedQty,
        workerCount,
        hoursWorked,
        reportedBy: userId,
        usedResources,
        continuationDecision,
        beforePhoto,
        afterPhoto,
        notes,
      });

      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      // Error manejado por el hook
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-x-hidden">
      <div className="bg-[var(--card-bg)] w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] h-auto rounded-t-3xl sm:rounded-[var(--radius-surface)] shadow-2xl border border-[var(--border-color)] overflow-hidden flex flex-col my-0 sm:my-auto text-[var(--text-primary)]">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--color-surface-subtle)] shrink-0">
          <div className="min-w-0 pr-2">
            <span className="font-brand text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-primary)] block truncate">
              Registro de Ejecución (Nivel 3)
            </span>
            <h3 className="font-brand text-base sm:text-lg font-extrabold text-[var(--text-primary)] truncate">
              {taskName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-[var(--radius-control)] hover:bg-[var(--color-surface-subtle)] transition-colors flex items-center justify-center touch-manipulation shrink-0 disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body (Scrollable container, never blocked by sticky footer) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 divide-y divide-[var(--border-color)] max-w-full pb-6">
          {/* Banner de Éxito / Replay Idempotente */}
          {result && (
            <div
              className={`p-4 rounded-[var(--radius-surface)] border flex items-start space-x-3 ${
                isIdempotentReplay
                  ? 'bg-[var(--color-warning-subtle)] border-[var(--color-warning)]/30 text-[var(--color-warning)]'
                  : 'bg-[var(--color-success-subtle)] border-[var(--color-success)]/30 text-[var(--color-success)]'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-[var(--color-success)]" />
              <div className="text-xs sm:text-sm">
                <p className="font-extrabold">
                  {isIdempotentReplay
                    ? 'Reintento Idempotente Confirmado'
                    : '¡Ejecución Registrada con Éxito!'}
                </p>
                <p className="mt-1 opacity-90 leading-relaxed">
                  {isIdempotentReplay
                    ? 'El gateway detectó una mutación previa idéntica y preservó el registro sin duplicar ejecución.'
                    : `Se registraron ${executedQty} ${contractualUnit} y la evidencia fotográfica quedó asociada.`}
                </p>
              </div>
            </div>
          )}

          {/* Banner de Error */}
          {error && (
            <div className="p-4 rounded-[var(--radius-surface)] border bg-[var(--color-danger-subtle)] border-[var(--color-danger)]/30 text-[var(--color-danger)] flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-[var(--color-danger)]" />
              <div className="text-xs sm:text-sm">
                <p className="font-extrabold">Error en el Registro de Ejecución</p>
                <p className="mt-1 leading-relaxed opacity-90">{error}</p>
              </div>
            </div>
          )}

          {/* Banner de Observación Supervisora Previa (PO-02 Contexto de Corrección) */}
          {item.executionsSummary?.latestRejectionNotes && !result && (
            <div
              className="p-3.5 rounded-[var(--radius-surface)] border bg-[var(--color-danger-subtle)] border-[var(--color-danger)]/30 text-[var(--color-danger)] flex items-start space-x-3"
              data-testid="modal-rejection-context-banner"
            >
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-[var(--color-danger)]" />
              <div className="text-xs sm:text-sm">
                <p className="font-extrabold text-[var(--color-danger)]">
                  Observación de Supervisión (Ejecución Anterior)
                </p>
                <p className="mt-1 leading-relaxed font-medium opacity-90">
                  {item.executionsSummary.latestRejectionNotes}
                </p>
              </div>
            </div>
          )}

          {/* 1. Formulario Principal de Ejecución */}
          <div className="pt-2 first:pt-0">
            <ExecutionForm
              taskName={taskName}
              contractualUnit={contractualUnit}
              plannedQty={plannedQty}
              previouslyReportedQty={previouslyReportedQty}
              previouslyVerifiedQty={previouslyVerifiedQty}
              executedQty={executedQty}
              onExecutedQtyChange={setExecutedQty}
              workerCount={workerCount}
              onWorkerCountChange={setWorkerCount}
              hoursWorked={hoursWorked}
              onHoursWorkedChange={setHoursWorked}
              continuationDecision={continuationDecision}
              onContinuationDecisionChange={setContinuationDecision}
              notes={notes}
              onNotesChange={setNotes}
              disabled={isSubmitting || !!result}
            />
          </div>

          {/* 2. Captura de Evidencia Fotográfica (ANTES / DESPUÉS) */}
          <div className="pt-6">
            <EvidenceCapture
              beforePhoto={beforePhoto}
              afterPhoto={afterPhoto}
              onBeforePhotoChange={setBeforePhoto}
              onAfterPhotoChange={setAfterPhoto}
              disabled={isSubmitting || !!result}
            />
          </div>

          {/* 3. Selector de Insumos y Equipos (POD-01) */}
          <div className="pt-6">
            <OperationalResourcePicker
              resources={usedResources}
              onChange={setUsedResources}
              disabled={isSubmitting || !!result}
            />
          </div>
        </div>

        {/* Modal Footer (Sticky Action Bar con Safe Area) */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-[var(--border-color)] bg-[var(--color-surface-subtle)] flex items-center justify-between gap-3 shrink-0 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[48px] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--color-surface-subtle)] rounded-[var(--radius-control)] transition-colors active:scale-95 touch-manipulation disabled:opacity-50"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>

          {!result ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || executedQty <= 0}
              className="font-brand min-h-[48px] px-6 py-3 text-sm font-extrabold bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 active:bg-[var(--color-primary)] text-white rounded-[var(--radius-control)] shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-98 touch-manipulation flex-1 sm:flex-initial"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>{stepLabel || 'Registrando...'}</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5 shrink-0" />
                  <span>REGISTRAR EJECUCIÓN</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="font-brand min-h-[48px] px-6 py-3 text-sm font-bold bg-[var(--color-success)] hover:bg-[var(--color-success)]/90 text-white rounded-[var(--radius-control)] shadow-md transition-all active:scale-95 touch-manipulation flex-1 sm:flex-initial"
            >
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyActivityExecutionModal;
