'use client';

// Jornadas de una actividad del plan — superficie del LÍDER.
// Ciclo: createExecution (borrador) → editar mientras esté en borrador →
// reportExecution (draft → reported, RPC valida rol y creador).
// verifyExecution/rejectExecution pertenecen a la futura vista de
// Verificación (Supervisor): aquí NO se muestran esos controles.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Loader2, Pencil, Send, Users, Clock, Camera, CloudOff, RefreshCw, AlertOctagon } from 'lucide-react';
import { useWeeklyPlanExecutions } from '@/hooks/useWeeklyPlans';
import { useWeeklyPlanMutations } from '@/hooks/useWeeklyPlanMutations';
import { useExecutionAttachments, EvidencePhase } from '@/hooks/useExecutionAttachments';
import { useExecutionSyncStatuses, useAttachmentSyncSummaries } from '@/hooks/useSyncState';
import { PendingAttachment } from '@/lib/offlineDB';
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
  draft: { text: 'Borrador', cls: 'bg-[var(--color-surface-subtle)] text-[var(--text-muted)] border-[var(--border-color)]' },
  reported: { text: 'Reportada', cls: 'bg-[var(--color-info-subtle)] text-[var(--color-info)] border-[var(--color-info)]/30' },
  verified: { text: 'Verificada', cls: 'bg-[var(--color-success-subtle)] text-[var(--color-success)] border-[var(--color-success)]/30' },
  rejected: { text: 'Rechazada', cls: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border-[var(--color-danger)]/30' },
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// Estado TÉCNICO (la cola) — deliberadamente distinto del chip de estado de
// NEGOCIO (STATUS_CHIP, arriba): un "Reportar" en cola no cambia el estado de
// negocio de la ejecución (sigue 'draft' hasta que el servidor confirme), así
// que este badge nunca debe decir "Reportada". Ver useSyncState.ts.
const SYNC_BADGE: Record<'pendiente' | 'sincronizando' | 'conflicto', { text: string; cls: string; Icon: typeof CloudOff }> = {
  pendiente: { text: 'Pendiente de sincronizar', cls: 'text-[var(--color-warning)] bg-[var(--color-warning-subtle)] border-[var(--color-warning)]/30', Icon: CloudOff },
  sincronizando: { text: 'Sincronizando…', cls: 'text-[var(--color-info)] bg-[var(--color-info-subtle)] border-[var(--color-info)]/30', Icon: RefreshCw },
  conflicto: { text: 'Conflicto — revisa la bandeja', cls: 'text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border-[var(--color-danger)]/30', Icon: AlertOctagon },
};

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
  const { data: executionSyncStatuses } = useExecutionSyncStatuses();
  const { data: attachmentSyncSummaries } = useAttachmentSyncSummaries();

  // 'closed' | 'new' | id de la ejecución en edición
  const [formMode, setFormMode] = useState<string>('closed');
  const [actionError, setActionError] = useState<string | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<string | null>(null);

  // Evidencia fotográfica — un modal a la vez, para la ejecución seleccionada
  const [evidenceExecId, setEvidenceExecId] = useState<string | null>(null);
  const {
    attachments: evidenceAttachments,
    pendingAttachments: evidencePending,
    uploadAttachment,
    deleteAttachment,
    deletePendingAttachment,
  } = useExecutionAttachments(evidenceExecId ?? undefined);

  // Object URLs locales para los Blobs pendientes — solo mientras no se
  // sincronizan (Sección 4 del diseño offline: estado transitorio, no final).
  // getPendingUrl() es la ÚNICA vía para obtener la URL de un pending: si
  // onUpload y galleryEntries llamaran cada uno a su propio
  // URL.createObjectURL(), el mismo Blob tendría dos URLs distintas y
  // onDelete (que busca por URL) nunca encontraría el registro a borrar.
  const pendingUrlsRef = useRef(new Map<string, string>());
  const getPendingUrl = (p: PendingAttachment) => {
    let url = pendingUrlsRef.current.get(p.id);
    if (!url) {
      url = URL.createObjectURL(p.file);
      pendingUrlsRef.current.set(p.id, url);
    }
    return url;
  };

  // Revoca URLs de pendings que ya no están en evidencePending — cubre TANTO
  // el borrado como la sincronización exitosa (en ambos casos el pending
  // desaparece de la lista). Deliberadamente NO revoca de forma síncrona en
  // el momento del clic de borrar: initialGallery (prop del modal) solo
  // refleja el cambio cuando React Query termina de refetch — revocar antes
  // deja un intervalo donde el efecto interno del modal que auto-selecciona
  // "initialGallery[0]" puede reseleccionar una URL ya revocada (imagen rota
  // persistente, encontrado verificando este mismo incremento).
  useEffect(() => {
    const currentIds = new Set((evidencePending ?? []).map((p) => p.id));
    const map = pendingUrlsRef.current;
    for (const [id, url] of map) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
      }
    }
  }, [evidencePending]);

  // Al cambiar de ejecución o desmontar, revocar todo lo que quede.
  useEffect(() => {
    const map = pendingUrlsRef.current;
    return () => {
      map.forEach((url) => URL.revokeObjectURL(url));
      map.clear();
    };
  }, [evidenceExecId]);

  const galleryEntries = useMemo(() => {
    const synced = (evidenceAttachments ?? []).map((a) => ({ url: a.file_url, kind: 'synced' as const, attachment: a }));
    const pending = (evidencePending ?? []).map((p) => ({ url: getPendingUrl(p), kind: 'pending' as const, pending: p }));
    return [...synced, ...pending];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceAttachments, evidencePending]);

  // Estado técnico por foto (Incremento 4c) — para el punto de color en cada
  // miniatura del modal. Solo las 'pending' tienen estado técnico; una
  // 'synced' ya no está en ninguna cola, no necesita indicador.
  const galleryStatuses = useMemo(() => {
    const map: Record<string, 'pending' | 'syncing' | 'conflict'> = {};
    for (const entry of galleryEntries) {
      if (entry.kind === 'pending') {
        map[entry.url] = entry.pending.status === 'conflicto'
          ? 'conflict'
          : entry.pending.status === 'sincronizando'
            ? 'syncing'
            : 'pending';
      }
    }
    return map;
  }, [galleryEntries]);

  // Fase por foto (Antes/Después) — para que el modal pueda advertir si toda
  // la evidencia quedó en una sola fase antes de confirmar (review: el
  // selector nunca se autocorrige, así que esta es la única red de
  // seguridad). Tanto synced como pending ya traen `phase` en su registro.
  const galleryPhases = useMemo(() => {
    const map: Record<string, EvidencePhase | null> = {};
    for (const entry of galleryEntries) {
      map[entry.url] = entry.kind === 'synced' ? entry.attachment.phase : entry.pending.phase;
    }
    return map;
  }, [galleryEntries]);

  // Referencia estable: PhotoVerificationModal reselecciona initialGallery[0]
  // en un efecto que depende de esta prop por identidad. Si se le pasara
  // `galleryEntries.map(...)` inline, cada re-render de ItemExecutions crea
  // un array nuevo (aunque el contenido no cambie) y dispara ese efecto de
  // más — encontrado porque "deshacía" el setSelectedPhoto(null) del botón
  // de borrar antes de que la mutación terminara, reseleccionando la foto
  // que se acababa de pedir borrar.
  const galleryUrls = useMemo(() => galleryEntries.map((e) => e.url), [galleryEntries]);

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
    setQueuedNotice(null);
    reportExecution.mutate(
      { executionId, planItemId },
      {
        onSuccess: (result) => {
          if (result.queued) {
            setQueuedNotice('Sin conexión — se reportará automáticamente cuando vuelvas a tener señal.');
          }
        },
        onError: (e) => setActionError(e.message),
      },
    );
  };

  return (
    <div className="px-4 md:px-6 py-4 bg-[var(--color-surface-subtle)] border-t border-[var(--border-color)] space-y-3">
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando jornadas…
        </div>
      )}

      {!isLoading && (executions?.length ?? 0) === 0 && formMode === 'closed' && (
        <p className="text-sm text-[var(--text-muted)] py-1">Sin jornadas registradas para esta actividad.</p>
      )}

      {executions?.map((exec) => {
        const chip = STATUS_CHIP[exec.status];
        const syncStatus = executionSyncStatuses?.get(exec.id);
        const attachSummary = attachmentSyncSummaries?.get(exec.id);
        const attachPendingTotal = (attachSummary?.pending ?? 0) + (attachSummary?.syncing ?? 0) + (attachSummary?.conflict ?? 0);
        const attachBadgeCls = attachSummary?.conflict
          ? 'bg-[var(--color-danger)]'
          : attachSummary?.syncing
            ? 'bg-[var(--color-info)]'
            : 'bg-[var(--color-warning)]';
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
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[var(--radius-control)] px-4 py-3.5 shadow-xs"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--text-secondary)] min-w-0">
              <span className="font-bold font-mono text-[var(--text-primary)]">{exec.execution_date}</span>
              {exec.crew_name && <span className="font-medium text-[var(--text-secondary)] truncate">· {exec.crew_name}</span>}
              <span className="flex items-center gap-1 text-[var(--text-muted)]">
                <Users className="w-4 h-4 text-[var(--text-muted)]" /> <span className="font-mono">{exec.worker_count}</span>
              </span>
              <span className="flex items-center gap-1 text-[var(--text-muted)] font-mono">
                <Clock className="w-4 h-4 text-[var(--text-muted)]" /> {clockTime(exec.started_at)}–{clockTime(exec.finished_at)}
              </span>
              <span className="bg-[var(--color-surface-subtle)] px-2 py-0.5 rounded border border-[var(--border-color)] font-semibold font-mono text-[var(--text-primary)]">
                {formatNumber(exec.executed_qty)} <span className="font-normal text-[var(--text-muted)]">{unit}</span>
              </span>
              <span className="text-[var(--text-muted)] font-mono">{formatNumber(exec.executed_jr)} JR</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 pt-1 sm:pt-0">
              <span className={`inline-block px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${chip.cls}`}>
                {chip.text}
              </span>

              <button
                onClick={() => setEvidenceExecId(exec.id)}
                disabled={busy}
                className="min-h-[44px] sm:min-h-[36px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--color-surface-subtle)] border border-[var(--border-color)] rounded-[var(--radius-control)] hover:bg-[var(--border-color)]/30 transition-colors disabled:opacity-60 active:scale-[0.98]"
              >
                <Camera className="w-4 h-4 text-[var(--text-muted)]" /> <span>Evidencias</span>
                {attachPendingTotal > 0 && (
                  <span
                    title={`${attachSummary?.pending ?? 0} pendiente(s), ${attachSummary?.syncing ?? 0} sincronizando, ${attachSummary?.conflict ?? 0} en conflicto`}
                    className={`flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-white text-[10px] font-bold ${attachBadgeCls}`}
                  >
                    {attachPendingTotal}
                  </span>
                )}
              </button>

              {exec.status === 'draft' && syncStatus && (() => {
                const badge = SYNC_BADGE[syncStatus];
                return (
                  <span className={`min-h-[44px] sm:min-h-[36px] flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-[var(--radius-control)] ${badge.cls}`}>
                    <badge.Icon className={`w-4 h-4 ${syncStatus === 'sincronizando' ? 'animate-spin' : ''}`} /> {badge.text}
                  </span>
                );
              })()}

              {exec.status === 'draft' && !syncStatus && (
                <>
                  <button
                    onClick={() => { setActionError(null); setFormMode(exec.id); }}
                    disabled={busy}
                    className="min-h-[44px] sm:min-h-[36px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--color-surface-subtle)] border border-[var(--border-color)] rounded-[var(--radius-control)] hover:bg-[var(--border-color)]/30 transition-colors disabled:opacity-60 active:scale-[0.98]"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Editar
                  </button>
                  <button
                    onClick={() => handleReport(exec.id)}
                    disabled={busy}
                    className="min-h-[44px] sm:min-h-[36px] flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 rounded-[var(--radius-control)] transition-colors disabled:opacity-60 shadow-xs active:scale-[0.98]"
                  >
                    {reportExecution.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />} Reportar
                  </button>
                </>
              )}
            </div>

            {exec.status === 'rejected' && exec.rejection_notes && (
              <p className="w-full text-xs text-[var(--color-danger)] sm:pl-1 font-medium">Motivo del rechazo: {exec.rejection_notes}</p>
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

      {actionError && <p className="text-xs font-semibold text-[var(--color-danger)]">{actionError}</p>}
      {queuedNotice && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-warning)] bg-[var(--color-warning-subtle)] p-2.5 rounded-[var(--radius-control)] border border-[var(--color-warning)]/30">
          <CloudOff className="w-4 h-4 shrink-0" /> {queuedNotice}
        </p>
      )}

      {formMode === 'closed' && (
        <button
          onClick={() => { setActionError(null); setFormMode('new'); }}
          disabled={busy}
          className="w-full sm:w-auto min-h-[48px] px-4 py-3 text-sm font-semibold text-[var(--color-primary)] border border-[var(--color-primary)]/30 bg-[var(--color-primary-subtle)] hover:bg-[var(--color-primary-subtle)]/80 rounded-[var(--radius-control)] flex items-center justify-center gap-2 transition-colors disabled:opacity-60 active:scale-[0.99]"
        >
          <Plus className="w-4 h-4 text-[var(--color-primary)]" /> Registrar jornada
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
            const entry = galleryEntries.find((e) => e.url === url);
            if (!entry) return;
            // El ObjectURL se revoca en el efecto que observa evidencePending
            // (arriba), no aquí — apenas se confirme la baja, no antes.
            if (entry.kind === 'pending') deletePendingAttachment.mutate(entry.pending.id);
            else deleteAttachment.mutate(entry.attachment);
          }}
          onUpload={(file, phase) => uploadAttachment.mutateAsync({ file, phase }).then((result) =>
            result.queued ? getPendingUrl(result.pending) : result.attachment.file_url
          )}
          capturePhase
          itemName="Evidencia de jornada"
          itemId={evidenceExecId}
          initialGallery={galleryUrls}
          galleryStatuses={galleryStatuses}
          galleryPhases={galleryPhases}
        />
      )}
    </div>
  );
}
