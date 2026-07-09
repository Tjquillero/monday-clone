'use client';

// Incremento 4c — único origen de verdad del estado TÉCNICO de sincronización
// por ejecución/adjunto, reutilizado por Mis Actividades, Verificación (si
// algún día tiene su propio productor offline) y cualquier otra vista.
//
// Deliberadamente separado del estado de NEGOCIO (draft/reported/verified/
// rejected, que vive en weekly_plan_item_executions y se lee vía
// useWeeklyPlanExecutions): mezclar ambos es el error clásico de las apps
// offline — mostrar "Reportada" cuando en realidad solo significa "está
// esperando sincronizar" haría que el líder confíe en un estado que el
// servidor todavía no confirmó. Aquí solo se responde "¿qué está haciendo la
// cola con esto?", nunca "¿qué es esto en el negocio?".

import { useQuery } from '@tanstack/react-query';
import { offlineDB, DomainCommand, PendingAttachment } from '@/lib/offlineDB';

export type ExecutionSyncStatus = 'pendiente' | 'sincronizando' | 'conflicto';
export interface AttachmentSyncSummary {
  pending: number;
  syncing: number;
  conflict: number;
}

function toExecutionStatus(status: DomainCommand['status']): ExecutionSyncStatus {
  if (status === 'conflicto') return 'conflicto';
  if (status === 'sincronizando') return 'sincronizando';
  // 'queued' | 'pendiente' | 'error' se agrupan bajo una sola etiqueta visible
  // (Sección 6 del diseño offline: la distinción interna importa para
  // depurar, no para lo que ve el líder en pantalla).
  return 'pendiente';
}

// ─────────────────────────────────────────────────────────────────────────────
// useExecutionSyncStatuses — Map<execution_id, estado> para TODAS las
// ejecuciones con un comando REPORT_EXECUTION en cola (cualquier estado que
// no sea "ya sincronizado" — un comando exitoso se elimina de la cola).
// ─────────────────────────────────────────────────────────────────────────────

export function useExecutionSyncStatuses() {
  return useQuery<Map<string, ExecutionSyncStatus>>({
    queryKey: ['domain_commands', 'by_execution_map'],
    queryFn: async () => {
      if (!offlineDB) return new Map();
      const commands: DomainCommand[] = await offlineDB.getCommands();
      const map = new Map<string, ExecutionSyncStatus>();
      for (const c of commands) {
        if (c.type !== 'REPORT_EXECUTION') continue;
        map.set(c.entity_id, toExecutionStatus(c.status));
      }
      return map;
    },
    enabled: !!offlineDB,
    staleTime: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useAttachmentSyncSummaries — Map<execution_id, conteo por estado> para
// badges de "Evidencias" sin tener que abrir el modal de cada Jornada.
// ─────────────────────────────────────────────────────────────────────────────

export function useAttachmentSyncSummaries() {
  return useQuery<Map<string, AttachmentSyncSummary>>({
    queryKey: ['pending_attachments', 'summary_map'],
    queryFn: async () => {
      if (!offlineDB) return new Map();
      const all: PendingAttachment[] = await offlineDB.getPendingAttachments();
      const map = new Map<string, AttachmentSyncSummary>();
      for (const p of all) {
        const s = map.get(p.execution_id) ?? { pending: 0, syncing: 0, conflict: 0 };
        if (p.status === 'conflicto') s.conflict += 1;
        else if (p.status === 'sincronizando') s.syncing += 1;
        else s.pending += 1;
        map.set(p.execution_id, s);
      }
      return map;
    },
    enabled: !!offlineDB,
    staleTime: 0,
  });
}
