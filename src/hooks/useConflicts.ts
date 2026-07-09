'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { offlineDB, DomainCommand, PendingAttachment } from '@/lib/offlineDB';
import { supabase } from '@/lib/supabaseClient';
import { ATTACHMENT_BUCKET } from '@/lib/storageUtils';

// ─────────────────────────────────────────────────────────────────────────────
// useConflicts — Incremento 4b del soporte offline (bandeja de conflictos).
//
// Un comando o adjunto queda en estado 'conflicto' cuando useOfflineSync
// recibe un fallo semántico del RPC/INSERT (no de red) — ver Sección 5 de
// offline-certification-design.md. Esos ítems NUNCA se reintentan solos
// (replayDomainCommands/syncPendingAttachments los saltan explícitamente),
// así que necesitan una intervención humana: Reintentar (si la causa ya se
// resolvió) o Descartar (abandonar ese cambio local).
//
// Deliberadamente sin gate de rol: los conflictos viven en el IndexedDB del
// DISPOSITIVO que encoló el comando — un admin en otra sesión no puede verlos
// ni resolverlos (no comparten almacenamiento local). Quien esté usando el
// dispositivo donde se generó el conflicto es quien tiene que decidir, sea
// líder, supervisor o asistente.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConflictItem {
  id: string;
  kind: 'command' | 'attachment';
  typeLabel: string;
  entityLabel: string;
  detail: string;
  createdAt: number;
}

function labelForExecution(exec: any, executionId: string): string {
  if (!exec) return `Jornada ${executionId.slice(0, 8)}`;
  const crew = exec.crew_name ? `${exec.crew_name} — ` : '';
  return `${crew}${exec.execution_date}`;
}

const COMMAND_TYPE_LABEL: Record<DomainCommand['type'], string> = {
  REPORT_EXECUTION: 'Reportar jornada',
  VERIFY_EXECUTION: 'Verificar jornada',
  REJECT_EXECUTION: 'Observar jornada',
  UPLOAD_ATTACHMENT: 'Subir evidencia',
};

export function useConflicts(triggerSync: () => Promise<void>) {
  const queryClient = useQueryClient();

  const { data: conflicts, isLoading } = useQuery<ConflictItem[]>({
    queryKey: ['offline_conflicts'],
    queryFn: async () => {
      if (!offlineDB) return [];
      const [commands, attachments, executions]: [DomainCommand[], PendingAttachment[], any[]] = await Promise.all([
        offlineDB.getCommands(),
        offlineDB.getPendingAttachments(),
        offlineDB.getTable('weekly_plan_item_executions'),
      ]);
      const execById = new Map(executions.map((e: any) => [e.id, e]));

      const commandItems: ConflictItem[] = commands
        .filter((c) => c.status === 'conflicto')
        .map((c) => ({
          id: c.id,
          kind: 'command',
          typeLabel: COMMAND_TYPE_LABEL[c.type] ?? c.type,
          entityLabel: labelForExecution(execById.get(c.entity_id), c.entity_id),
          detail: c.last_error?.message ?? 'Sin detalle del error.',
          createdAt: c.created_at,
        }));

      const attachmentItems: ConflictItem[] = attachments
        .filter((p) => p.status === 'conflicto')
        .map((p) => ({
          id: p.id,
          kind: 'attachment',
          typeLabel: 'Subir evidencia',
          entityLabel: labelForExecution(execById.get(p.execution_id), p.execution_id),
          detail: p.last_error?.message ?? 'Sin detalle del error.',
          createdAt: p.created_at,
        }));

      return [...commandItems, ...attachmentItems].sort((a, b) => a.createdAt - b.createdAt);
    },
    enabled: !!offlineDB,
    staleTime: 0,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['offline_conflicts'] });
    queryClient.invalidateQueries({ queryKey: ['domain_commands'] });
    queryClient.invalidateQueries({ queryKey: ['pending_attachments'] });
  };

  // Reintentar: mismo command_id / mismo Blob, solo se saca del estado
  // 'conflicto' para que el próximo triggerSync() lo vuelva a intentar. No
  // reescribe el comando ni el archivo — si la causa del conflicto sigue
  // vigente, va a volver a fallar y a marcarse 'conflicto' otra vez, lo cual
  // es el comportamiento correcto (no ocultar un conflicto real).
  const retry = async (item: ConflictItem) => {
    if (!offlineDB) return;
    if (item.kind === 'command') {
      await offlineDB.updateCommand(item.id, { status: 'pendiente', attempts: 0, last_error: null });
    } else {
      await offlineDB.updatePendingAttachment(item.id, { status: 'pendiente', attempts: 0, last_error: null });
    }
    invalidateAll();
    await triggerSync();
  };

  // Descartar: abandona el cambio local. Si ya se había subido el archivo a
  // Storage antes de que fallara el INSERT (storage_path set), lo borra
  // también — descartar debe deshacer todo, no dejar un Blob huérfano en
  // Storage para siempre (Invariante 4).
  const discard = async (item: ConflictItem) => {
    if (!offlineDB) return;
    if (item.kind === 'command') {
      await offlineDB.removeCommand(item.id);
    } else {
      const pendings: PendingAttachment[] = await offlineDB.getPendingAttachments();
      const pending = pendings.find((p) => p.id === item.id);
      if (pending?.storage_path) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([pending.storage_path]);
      }
      await offlineDB.removePendingAttachment(item.id);
    }
    invalidateAll();
    // triggerSync() no tiene nada que sincronizar aquí (el ítem ya se borró),
    // pero su cola termina recalculando pendingCount/conflictCount desde
    // IndexedDB (useOfflineSync.checkStatus) — sin esto, el badge de
    // conflicto en OfflineIndicator queda con el conteo viejo hasta el
    // siguiente poll de 30s, porque ese estado vive fuera de React Query y
    // no se entera de invalidateQueries().
    await triggerSync();
  };

  return { conflicts: conflicts ?? [], isLoading, retry, discard };
}
