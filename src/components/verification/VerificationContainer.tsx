'use client';

// Bandeja de revisión del Supervisor. Una tarjeta por Jornada reportada:
// Actividad, Sector, Cantidad, Fecha/hora, Cuadrilla, miniaturas de evidencia.
// Dos acciones: Verificar u Observar (motivo obligatorio de una línea).
// Evidencia: mismo PhotoVerificationModal del líder, en modo solo-lectura
// (sin onUpload) — el supervisor revisa, no vuelve a subir fotos.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, CalendarX2, AlertTriangle, Check, TriangleAlert, Camera, Users, Clock } from 'lucide-react';
import { useVerificationQueue, VerificationQueueItem } from '@/hooks/useVerificationQueue';
import { useWeeklyPlanMutations } from '@/hooks/useWeeklyPlanMutations';
import { useExecutionAttachments } from '@/hooks/useExecutionAttachments';
import PhotoVerificationModal from '@/components/modals/PhotoVerificationModal';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function VerificationContainer() {
  const queryClient = useQueryClient();
  const { data: queue, isLoading, isError, error } = useVerificationQueue();
  const { verifyExecution, rejectExecution } = useWeeklyPlanMutations(undefined);

  // useWeeklyPlanMutations es compartido con Mis Actividades y no conoce
  // esta query — se invalida aquí, en el consumidor que sí sabe que le importa.
  const invalidateQueue = () => queryClient.invalidateQueries({ queryKey: ['verification_queue'] });

  const [observingId, setObservingId] = useState<string | null>(null);
  const [observationNotes, setObservationNotes] = useState('');
  const [evidenceExecId, setEvidenceExecId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { attachments: evidenceAttachments } = useExecutionAttachments(evidenceExecId ?? undefined);

  const busy = verifyExecution.isPending || rejectExecution.isPending;

  const handleVerify = (item: VerificationQueueItem) => {
    setActionError(null);
    verifyExecution.mutate(
      { executionId: item.id, planItemId: item.plan_item_id },
      { onSuccess: invalidateQueue, onError: (e) => setActionError(e.message) },
    );
  };

  const handleObserve = (item: VerificationQueueItem) => {
    if (!observationNotes.trim()) return;
    setActionError(null);
    rejectExecution.mutate(
      { executionId: item.id, planItemId: item.plan_item_id, notes: observationNotes.trim() },
      {
        onSuccess: () => { setObservingId(null); setObservationNotes(''); invalidateQueue(); },
        onError: (e) => setActionError(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Cargando pendientes…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-red-50/50 rounded-2xl border-2 border-dashed border-red-200">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-4" />
        <p className="text-red-500 font-medium">No se pudo cargar la bandeja.</p>
        <p className="text-xs text-red-400 mt-1">{error instanceof Error ? error.message : 'Error desconocido'}</p>
      </div>
    );
  }

  if (!queue || queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
        <CalendarX2 className="w-8 h-8 text-slate-300 mb-4" />
        <p className="text-slate-500 font-medium">Sin actividades pendientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 mb-2">
        <span className="font-semibold text-slate-700">{queue.length}</span> pendiente{queue.length !== 1 ? 's' : ''} por verificar
      </p>

      {queue.map((item) => (
        <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="font-bold text-slate-800">{item.activity_name ?? item.activity_key}</p>
            <p className="text-xs text-slate-400">{item.group_title}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {formatNumber(item.executed_qty)} {item.planned_unit}
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="w-3.5 h-3.5" /> {item.execution_date} · {clockTime(item.started_at)}–{clockTime(item.finished_at)}
            </span>
            {item.crew_name && (
              <span className="flex items-center gap-1 text-slate-500">
                <Users className="w-3.5 h-3.5" /> {item.crew_name}
              </span>
            )}
          </div>

          <button
            onClick={() => setEvidenceExecId(item.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" /> Ver evidencia
          </button>

          {observingId === item.id ? (
            <div className="space-y-2 pt-1">
              <input
                type="text"
                autoFocus
                value={observationNotes}
                onChange={(e) => setObservationNotes(e.target.value)}
                placeholder="Motivo de la observación"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setObservingId(null); setObservationNotes(''); }}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleObserve(item)}
                  disabled={busy || !observationNotes.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  {rejectExecution.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirmar observación
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleVerify(item)}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
              >
                {verifyExecution.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />} Verificar
              </button>
              <button
                onClick={() => { setActionError(null); setObservingId(item.id); }}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors disabled:opacity-50"
              >
                <TriangleAlert className="w-4 h-4" /> Observar
              </button>
            </div>
          )}
        </div>
      ))}

      {actionError && <p className="text-xs font-semibold text-red-500">{actionError}</p>}

      {evidenceExecId && (
        <PhotoVerificationModal
          isOpen={!!evidenceExecId}
          onClose={() => setEvidenceExecId(null)}
          onSave={() => {}}
          readOnly
          itemName="Evidencia de jornada"
          itemId={evidenceExecId}
          initialGallery={evidenceAttachments?.map((a) => a.file_url) ?? []}
        />
      )}
    </div>
  );
}
