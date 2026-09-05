'use client';

// Bandeja de revisión del Supervisor — Visor Operacional con miniaturas de evidencia (Photo Preview Strip).
// Las dos acciones supervisoras mantienen exactamente sus payloads y RPCs:
// verifyExecution ({ executionId, planItemId }) -> verify_execution
// rejectExecution ({ executionId, planItemId, notes }) -> reject_execution

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, CalendarX2, AlertTriangle, Check, TriangleAlert, Camera, Users, Clock, Image as ImageIcon } from 'lucide-react';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useVerificationQueue, VerificationQueueItem } from '@/hooks/useVerificationQueue';
import { useWeeklyPlanMutations } from '@/hooks/useWeeklyPlanMutations';
import { useExecutionAttachments, ExecutionAttachment } from '@/hooks/useExecutionAttachments';
import PhotoVerificationModal from '@/components/modals/PhotoVerificationModal';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function VerificationItemCard({
  item,
  isObserving,
  observationNotes,
  setObservationNotes,
  onStartObserving,
  onCancelObserving,
  onVerify,
  onObserve,
  onOpenEvidence,
  busy,
  isVerifying,
  isRejecting,
}: {
  item: VerificationQueueItem;
  isObserving: boolean;
  observationNotes: string;
  setObservationNotes: (val: string) => void;
  onStartObserving: () => void;
  onCancelObserving: () => void;
  onVerify: () => void;
  onObserve: () => void;
  onOpenEvidence: (attachments: ExecutionAttachment[]) => void;
  busy: boolean;
  isVerifying: boolean;
  isRejecting: boolean;
}) {
  const { attachments } = useExecutionAttachments(item.id);
  const photoCount = attachments?.length ?? 0;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 space-y-4 shadow-xs hover:border-slate-300 transition-all">
      {/* Cabecera: Actividad y Sitio */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
            {item.activity_name ?? item.activity_key}
          </h3>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
            <span>{item.group_title}</span>
          </div>
        </div>
        <span className="self-start inline-block px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
          Reportada
        </span>
      </div>

      {/* Métricas y Datos Contextuales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100/80 text-xs">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Ejecutado</span>
          <span className="font-extrabold text-slate-900 text-sm sm:text-base">{formatNumber(item.executed_qty)}</span>{' '}
          <span className="text-slate-500 font-medium">{item.planned_unit}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Fecha y Horario</span>
          <span className="font-bold text-slate-800 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {item.execution_date}
          </span>
          <span className="text-[11px] text-slate-500 block">{clockTime(item.started_at)}–{clockTime(item.finished_at)}</span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Cuadrilla</span>
          <span className="font-bold text-slate-800 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            {item.crew_name || 'Sin cuadrilla'} ({item.worker_count})
          </span>
        </div>
      </div>

      {/* Strip de Miniaturas de Evidencia Fotográfica */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-slate-600" /> Evidencia ({photoCount})
          </span>
          {photoCount > 0 && (
            <button
              onClick={() => onOpenEvidence(attachments!)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Ver en pantalla completa
            </button>
          )}
        </div>

        {photoCount > 0 ? (
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 custom-scrollbar">
            {attachments!.slice(0, 6).map((att) => (
              <button
                key={att.id}
                onClick={() => onOpenEvidence(attachments!)}
                className="relative group shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shadow-xs transition-transform active:scale-95"
              >
                <img
                  src={att.file_url}
                  alt={att.file_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <span className="absolute bottom-1 left-1 right-1 px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[9px] font-bold text-white text-center truncate">
                  {att.phase === 'before' ? 'Antes' : att.phase === 'after' ? 'Después' : 'Evidencia'}
                </span>
              </button>
            ))}
            {photoCount > 6 && (
              <button
                onClick={() => onOpenEvidence(attachments!)}
                className="shrink-0 w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                +{photoCount - 6} más
              </button>
            )}
          </div>
        ) : (
          <div className="p-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 flex items-center gap-2">
            <Camera className="w-4 h-4 text-slate-300 shrink-0" />
            <span>Sin fotos adjuntas para esta jornada.</span>
          </div>
        )}
      </div>

      {/* Panel de Decisiones del Supervisor */}
      {isObserving ? (
        <div className="space-y-3 pt-2 bg-amber-50/60 p-4 rounded-xl border border-amber-200/80">
          <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider">
            Motivo de la Observación / Rechazo
          </label>
          <input
            type="text"
            autoFocus
            value={observationNotes}
            onChange={(e) => setObservationNotes(e.target.value)}
            placeholder="Escriba el motivo detallado de la observación (obligatorio)..."
            className="w-full min-h-[44px] px-3.5 py-2.5 text-sm border border-amber-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
            <button
              onClick={onCancelObserving}
              disabled={busy}
              className="min-h-[48px] sm:min-h-[40px] px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors border border-slate-200 sm:border-0 rounded-xl"
            >
              Cancelar
            </button>
            <button
              onClick={onObserve}
              disabled={busy || !observationNotes.trim()}
              className="min-h-[48px] sm:min-h-[40px] flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50 shadow-xs active:scale-[0.99]"
            >
              {isRejecting && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar observación
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
          <button
            onClick={onVerify}
            disabled={busy}
            className="min-h-[48px] flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50 shadow-xs active:scale-[0.99]"
          >
            {isVerifying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5" />
            )}
            <span>Verificar Ejecución</span>
          </button>
          <button
            onClick={onStartObserving}
            disabled={busy}
            className="min-h-[48px] sm:flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl transition-colors disabled:opacity-50 active:scale-[0.99]"
          >
            <TriangleAlert className="w-5 h-5 text-amber-600" />
            <span>Observar</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function VerificationContainer() {
  const queryClient = useQueryClient();
  const { data: queue, isLoading, isError, error } = useVerificationQueue();
  const { verifyExecution, rejectExecution } = useWeeklyPlanMutations(undefined);

  const invalidateQueue = () => queryClient.invalidateQueries({ queryKey: ['verification_queue'] });

  const [observingId, setObservingId] = useState<string | null>(null);
  const [observationNotes, setObservationNotes] = useState('');
  const [evidenceExecId, setEvidenceExecId] = useState<string | null>(null);
  const [modalAttachments, setModalAttachments] = useState<any[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

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
        onSuccess: () => {
          setObservingId(null);
          setObservationNotes('');
          invalidateQueue();
        },
        onError: (e) => setActionError(e.message),
      },
    );
  };

  const handleOpenEvidence = (execId: string, attachments: any[]) => {
    setEvidenceExecId(execId);
    setModalAttachments(attachments);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-red-50/50 rounded-2xl border-2 border-dashed border-red-200">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-4" />
        <p className="text-red-500 font-medium">No se pudo cargar la bandeja de verificación.</p>
        <p className="text-xs text-red-400 mt-1">{error instanceof Error ? error.message : 'Error desconocido'}</p>
      </div>
    );
  }

  if (!queue || queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
        <CalendarX2 className="w-8 h-8 text-slate-300 mb-4" />
        <p className="text-slate-500 font-medium">Sin actividades pendientes por verificar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-1">
        <p className="text-sm font-semibold text-slate-600">
          <span className="font-extrabold text-slate-900">{queue.length}</span>{' '}
          {queue.length === 1 ? 'jornada pendiente' : 'jornadas pendientes'} por verificar
        </p>
      </div>

      <div className="space-y-4">
        {queue.map((item) => (
          <VerificationItemCard
            key={item.id}
            item={item}
            isObserving={observingId === item.id}
            observationNotes={observationNotes}
            setObservationNotes={setObservationNotes}
            onStartObserving={() => {
              setActionError(null);
              setObservingId(item.id);
              setObservationNotes('');
            }}
            onCancelObserving={() => {
              setObservingId(null);
              setObservationNotes('');
            }}
            onVerify={() => handleVerify(item)}
            onObserve={() => handleObserve(item)}
            onOpenEvidence={(atts) => handleOpenEvidence(item.id, atts)}
            busy={busy}
            isVerifying={verifyExecution.isPending && verifyExecution.variables?.executionId === item.id}
            isRejecting={rejectExecution.isPending && rejectExecution.variables?.executionId === item.id}
          />
        ))}
      </div>

      {actionError && (
        <p className="text-xs font-semibold text-red-500 bg-red-50 p-3 rounded-xl border border-red-200">
          {actionError}
        </p>
      )}

      {evidenceExecId && (
        <PhotoVerificationModal
          isOpen={!!evidenceExecId}
          onClose={() => {
            setEvidenceExecId(null);
            setModalAttachments([]);
          }}
          onSave={() => {}}
          readOnly
          itemName="Evidencia de jornada"
          itemId={evidenceExecId}
          initialGallery={modalAttachments.map((a) => a.file_url)}
        />
      )}
    </div>
  );
}
