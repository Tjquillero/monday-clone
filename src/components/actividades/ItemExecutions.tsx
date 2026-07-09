'use client';

// Jornadas de una actividad del plan — superficie del LÍDER.
// Ciclo: createExecution (borrador) → editar mientras esté en borrador →
// reportExecution (draft → reported, RPC valida rol y creador).
// verifyExecution/rejectExecution pertenecen a la futura vista de
// Verificación (Supervisor): aquí NO se muestran esos controles.

import { useState } from 'react';
import { Plus, Loader2, Pencil, Send, Users, Clock, Camera } from 'lucide-react';
import { useWeeklyPlanExecutions } from '@/hooks/useWeeklyPlans';
import { useWeeklyPlanMutations } from '@/hooks/useWeeklyPlanMutations';
import { useExecutionAttachments } from '@/hooks/useExecutionAttachments';
import { ExecutionStatus } from '@/types/scheduler';
import JornadaForm from './JornadaForm';
import PhotoVerificationModal from '@/components/modals/PhotoVerificationModal';
import {
  JornadaFormValues, jornadaTimestamps, clockTime, executionToFormValues,
} from './jornadaUtils';

interface Props {
  planId: string;
  groupId: string;
  planItemId: string;
  unit: string;
}

const STATUS_CHIP: Record<ExecutionStatus, { text: string; cls: string }> = {
  draft: { text: 'Borrador', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  reported: { text: 'Reportada', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  verified: { text: 'Verificada', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  rejected: { text: 'Rechazada', cls: 'bg-red-50 text-red-600 border-red-200' },
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function toCreateInput(planItemId: string, planId: string, groupId: string, v: JornadaFormValues) {
  return {
    plan_item_id: planItemId,
    plan_id: planId,
    group_id: groupId,
    execution_date: v.execution_date,
    crew_name: v.crew_name || null,
    worker_count: v.worker_count,
    ...jornadaTimestamps(v),
    executed_qty: v.executed_qty,
    notes: v.notes || null,
  };
}

export default function ItemExecutions({ planId, groupId, planItemId, unit }: Props) {
  const { data: executions, isLoading } = useWeeklyPlanExecutions(planItemId);
  const { createExecution, updateDraftExecution, reportExecution } = useWeeklyPlanMutations(undefined);

  // 'closed' | 'new' | id de la ejecución en edición
  const [formMode, setFormMode] = useState<string>('closed');
  const [actionError, setActionError] = useState<string | null>(null);

  // Evidencia fotográfica — un modal a la vez, para la ejecución seleccionada
  const [evidenceExecId, setEvidenceExecId] = useState<string | null>(null);
  const {
    attachments: evidenceAttachments,
    uploadAttachment,
    deleteAttachment,
  } = useExecutionAttachments(evidenceExecId ?? undefined);

  const busy = createExecution.isPending || updateDraftExecution.isPending || reportExecution.isPending;

  const handleCreate = (v: JornadaFormValues) => {
    setActionError(null);
    createExecution.mutate(toCreateInput(planItemId, planId, groupId, v), {
      onSuccess: () => setFormMode('closed'),
      onError: (e) => setActionError(e.message),
    });
  };

  const handleUpdate = (executionId: string) => (v: JornadaFormValues) => {
    setActionError(null);
    updateDraftExecution.mutate(
      {
        executionId,
        planItemId,
        changes: {
          crew_name: v.crew_name || null,
          worker_count: v.worker_count,
          ...jornadaTimestamps(v),
          executed_qty: v.executed_qty,
          notes: v.notes || null,
        },
      },
      {
        onSuccess: () => setFormMode('closed'),
        onError: (e) => setActionError(e.message),
      },
    );
  };

  const handleReport = (executionId: string) => {
    setActionError(null);
    reportExecution.mutate(
      { executionId, planItemId },
      { onError: (e) => setActionError(e.message) },
    );
  };

  return (
    <div className="px-4 md:px-6 py-4 bg-slate-50/60 border-t border-slate-100 space-y-3">
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando jornadas…
        </div>
      )}

      {!isLoading && (executions?.length ?? 0) === 0 && formMode === 'closed' && (
        <p className="text-sm text-slate-400 py-1">Sin jornadas registradas para esta actividad.</p>
      )}

      {executions?.map((exec) => {
        const chip = STATUS_CHIP[exec.status];
        if (formMode === exec.id) {
          return (
            <JornadaForm
              key={exec.id}
              unit={unit}
              initial={executionToFormValues(exec)}
              submitting={updateDraftExecution.isPending}
              submitLabel="Guardar cambios"
              onSubmit={handleUpdate(exec.id)}
              onCancel={() => setFormMode('closed')}
            />
          );
        }
        return (
          <div
            key={exec.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 min-w-0">
              <span className="font-semibold text-slate-800">{exec.execution_date}</span>
              {exec.crew_name && <span className="truncate">{exec.crew_name}</span>}
              <span className="flex items-center gap-1 text-slate-500">
                <Users className="w-3.5 h-3.5" /> {exec.worker_count}
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <Clock className="w-3.5 h-3.5" /> {clockTime(exec.started_at)}–{clockTime(exec.finished_at)}
              </span>
              <span>
                <span className="font-semibold text-slate-800">{formatNumber(exec.executed_qty)}</span> {unit}
              </span>
              <span className="text-slate-500">{formatNumber(exec.executed_jr)} JR</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${chip.cls}`}>
                {chip.text}
              </span>
              <button
                onClick={() => setEvidenceExecId(exec.id)}
                disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                <Camera className="w-3 h-3" /> Evidencias
              </button>
              {exec.status === 'draft' && (
                <>
                  <button
                    onClick={() => { setActionError(null); setFormMode(exec.id); }}
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={() => handleReport(exec.id)}
                    disabled={busy}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {reportExecution.isPending
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Send className="w-3 h-3" />} Reportar
                  </button>
                </>
              )}
            </div>

            {exec.status === 'rejected' && exec.rejection_notes && (
              <p className="w-full text-xs text-red-500 sm:pl-1">Motivo del rechazo: {exec.rejection_notes}</p>
            )}
          </div>
        );
      })}

      {formMode === 'new' && (
        <JornadaForm
          unit={unit}
          submitting={createExecution.isPending}
          submitLabel="Guardar borrador"
          onSubmit={handleCreate}
          onCancel={() => setFormMode('closed')}
        />
      )}

      {actionError && <p className="text-xs font-semibold text-red-500">{actionError}</p>}

      {formMode === 'closed' && (
        <button
          onClick={() => { setActionError(null); setFormMode('new'); }}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50/50 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-60"
        >
          <Plus className="w-3.5 h-3.5" /> Registrar jornada
        </button>
      )}

      {evidenceExecId && (
        <PhotoVerificationModal
          isOpen={!!evidenceExecId}
          onClose={() => setEvidenceExecId(null)}
          // no-op: onUpload ya persiste y refresca la galería vía React Query.
          // TODO: onSave queda vestigial en este flujo — evaluar retirarla del
          // modal cuando se migren el resto de consumidores (ExecutionView).
          onSave={() => {}}
          onDelete={(url) => {
            const target = evidenceAttachments?.find((a) => a.file_url === url);
            if (target) deleteAttachment.mutate(target);
          }}
          onUpload={(file) => uploadAttachment.mutateAsync(file).then((a) => a.file_url)}
          itemName="Evidencia de jornada"
          itemId={evidenceExecId}
          initialGallery={evidenceAttachments?.map((a) => a.file_url) ?? []}
        />
      )}
    </div>
  );
}
