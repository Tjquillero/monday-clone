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
    error,
    result,
    isIdempotentReplay,
    resetMutation,
  } = useFieldExecutionMutation();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setExecutedQty(0);
      setWorkerCount(1);
      setHoursWorked(8);
      setContinuationDecision('CONTINUA_MANANA');
      setNotes('');
      setUsedResources([]);
      setBeforePhoto(null);
      setAfterPhoto(null);
      resetMutation();
    }
  }, [isOpen, resetMutation]);

  if (!isOpen) return null;

  const taskName = item.standard?.name || item.name || item.activity_key;
  const contractualUnit = item.unit || 'und';
  const plannedQty = item.planned_qty || 0;
  const previouslyReportedQty = item.executed_qty || 0;
  const previouslyVerifiedQty = (item as any).verified_qty || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (executedQty <= 0) {
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-x-hidden">
      <div className="bg-white w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] h-auto rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-0 sm:my-auto">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="min-w-0 pr-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary block truncate">
              Registro de Ejecución (Nivel 3)
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
              {taskName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center touch-manipulation shrink-0"
            aria-label="Cerrar modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body (Scrollable container, never blocked by sticky footer) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 divide-y divide-slate-100 max-w-full pb-6">
          {/* Banner de Éxito / Replay Idempotente */}
          {result && (
            <div
              className={`p-4 rounded-2xl border flex items-start space-x-3 ${
                isIdempotentReplay
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600" />
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
            <div className="p-4 rounded-2xl border bg-red-50 border-red-200 text-red-900 flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs sm:text-sm">
                <p className="font-extrabold">Error en el Registro de Ejecución</p>
                <p className="mt-1 text-red-700 leading-relaxed">{error}</p>
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
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200/80 bg-slate-50 flex items-center justify-between gap-3 shrink-0 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[48px] px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors active:scale-95 touch-manipulation"
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>

          {!result ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || executedQty <= 0}
              className="min-h-[48px] px-6 py-3 text-sm font-extrabold bg-primary hover:bg-primary/90 active:bg-blue-700 text-white rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-98 touch-manipulation flex-1 sm:flex-initial"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>Registrando...</span>
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
              className="min-h-[48px] px-6 py-3 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all active:scale-95 touch-manipulation flex-1 sm:flex-initial"
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
