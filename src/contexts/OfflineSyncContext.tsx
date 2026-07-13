'use client';

// Incremento 4c del soporte offline — único origen de verdad del estado de
// sincronización. Antes de este archivo, useOfflineSync() se llamaba tres
// veces de forma independiente (OfflineIndicator se renderiza dos veces —
// riel lateral + header móvil — y ProfessionalLayout lo llama una tercera
// vez): cada instancia escuchaba 'online'/'offline' por su cuenta y disparaba
// su propio triggerSync()/refreshLocalCache() al reconectar, sincronizando la
// misma cola varias veces en paralelo. Consolidado en un Context montado una
// sola vez (Providers.tsx).
//
// Este archivo NO cambia ninguna regla de negocio ni la lógica de los tres
// carriles (CRUD / comandos de dominio / Blobs) ya verificada en los
// Incrementos 1-4b — solo añade dos cosas puramente de presentación:
//   - syncProgress: conteo real de ítems procesados durante un triggerSync(),
//     para mostrar progreso en vez de un spinner ciego.
//   - lastSyncResult: cuántas operaciones se sincronizaron y cuántas
//     quedaron en conflicto en la ÚLTIMA corrida, para el mensaje de cierre
//     ("3 operaciones sincronizadas. 1 requiere intervención.").
// Y persiste el estado 'sincronizando' en cada comando/adjunto justo antes
// de intentarlo (ya existía en el tipo desde el diseño original, nunca se
// asignaba) para que el estado por ejecución/evidencia distinga
// pendiente/sincronizando/conflicto en vez de solo "pendiente o no".
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB, DomainCommand, PendingAttachment } from '@/lib/offlineDB';
import { isNetworkError } from '@/hooks/useBoardData';
import { ATTACHMENT_BUCKET, buildAttachmentPath } from '@/lib/storageUtils';

interface ReplayResult {
  synced: number;
  newConflicts: number;
  remaining: number;
}

export interface SyncProgress {
  done: number;
  total: number;
}

export interface LastSyncResult {
  synced: number;
  conflicts: number;
}

interface OfflineSyncContextValue {
  isOnline: boolean;
  syncStatus: 'synced' | 'syncing' | 'error';
  pendingCount: number;
  conflictCount: number;
  lastSyncAt: Date | null;
  syncProgress: SyncProgress | null;
  lastSyncResult: LastSyncResult | null;
  triggerSync: () => Promise<void>;
  refreshLocalCache: () => Promise<void>;
  dismissLastSyncResult: () => void;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [conflictCount, setConflictCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<LastSyncResult | null>(null);

  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const online = window.navigator.onLine;
    setIsOnline(online);

    if (offlineDB) {
      try {
        const [mutations, commands, attachments]: [any[], DomainCommand[], PendingAttachment[]] = await Promise.all([
          offlineDB.getMutations(),
          offlineDB.getCommands(),
          offlineDB.getPendingAttachments(),
        ]);
        setPendingCount(mutations.length + commands.length + attachments.length);
        setConflictCount(
          commands.filter((c) => c.status === 'conflicto').length +
          attachments.filter((a) => a.status === 'conflicto').length,
        );
      } catch (e) {
        console.error('[offlineSync] Error reading mutations:', e);
      }
    }
  }, []);

  const refreshLocalCache = useCallback(async () => {
    if (!offlineDB || typeof window === 'undefined' || !window.navigator.onLine) return;
    try {
      const tables = [
        'boards', 'groups', 'items', 'site_incidents', 'board_columns',
        'activity_templates', 'task_dependencies',
        'weekly_plans', 'weekly_plan_items', 'weekly_plan_item_executions', 'board_activity_standards',
      ];
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*');
        if (!error && data) {
          await offlineDB.saveTable(table, data);
        }
      }
      console.log('[offlineSync] Local IndexedDB snapshot cache updated for all tables.');
    } catch (err) {
      console.error('[offlineSync] Failed to update local snapshot cache:', err);
    }
  }, []);

  const replayDomainCommands = useCallback(async (onItemDone: () => void): Promise<ReplayResult> => {
    if (!offlineDB || typeof window === 'undefined' || !window.navigator.onLine) return { synced: 0, newConflicts: 0, remaining: 0 };
    const commands: DomainCommand[] = await offlineDB.getCommands();
    if (commands.length === 0) return { synced: 0, newConflicts: 0, remaining: 0 };

    console.log(`[offlineSync] Starting sync for ${commands.length} domain commands...`);
    const stillQueuedIds = new Set(commands.map((c) => c.id));
    let synced = 0, newConflicts = 0, remaining = 0;

    for (const cmd of commands) {
      if (cmd.status === 'conflicto') { remaining += 1; continue; } // requiere intervención humana
      if (cmd.depends_on && stillQueuedIds.has(cmd.depends_on)) { remaining += 1; continue; }

      await offlineDB.updateCommand(cmd.id, { status: 'sincronizando' });
      queryClient.invalidateQueries({ queryKey: ['domain_commands'] });

      try {
        let error: any = null;
        if (cmd.type === 'REPORT_EXECUTION') {
          const res = await supabase.rpc('report_execution', cmd.payload);
          error = res.error;
        } else {
          error = { code: 'UNSUPPORTED_COMMAND', message: `Tipo de comando no soportado todavía: ${cmd.type}` };
        }

        if (!error) {
          await offlineDB.removeCommand(cmd.id);
          stillQueuedIds.delete(cmd.id);
          synced += 1;
          console.log(`[offlineSync] Comando ${cmd.type} (${cmd.id}) sincronizado.`);
        } else if (isNetworkError(error)) {
          await offlineDB.updateCommand(cmd.id, { status: 'pendiente', attempts: cmd.attempts + 1, last_error: { code: error.code, message: error.message } });
          remaining += 1;
        } else {
          await offlineDB.updateCommand(cmd.id, { status: 'conflicto', last_error: { code: error.code, message: error.message } });
          newConflicts += 1;
          remaining += 1;
          console.warn(`[offlineSync] Comando ${cmd.type} (${cmd.id}) en conflicto:`, error.message);
        }
      } catch (err: any) {
        await offlineDB.updateCommand(cmd.id, { status: 'pendiente', attempts: cmd.attempts + 1, last_error: { message: err?.message ?? 'Error desconocido' } });
        remaining += 1;
      }
      onItemDone();
    }

    queryClient.invalidateQueries({ queryKey: ['domain_commands'] });
    queryClient.invalidateQueries({ queryKey: ['offline_conflicts'] });
    return { synced, newConflicts, remaining };
  }, [queryClient]);

  const syncPendingAttachments = useCallback(async (onItemDone: () => void): Promise<ReplayResult> => {
    if (!offlineDB || typeof window === 'undefined' || !window.navigator.onLine) return { synced: 0, newConflicts: 0, remaining: 0 };
    const pendings: PendingAttachment[] = await offlineDB.getPendingAttachments();
    if (pendings.length === 0) return { synced: 0, newConflicts: 0, remaining: 0 };

    console.log(`[offlineSync] Starting sync for ${pendings.length} pending attachments...`);
    let synced = 0, newConflicts = 0, remaining = 0;

    for (const p of pendings) {
      if (p.status === 'conflicto') { remaining += 1; continue; }

      await offlineDB.updatePendingAttachment(p.id, { status: 'sincronizando' });
      queryClient.invalidateQueries({ queryKey: ['pending_attachments'] });

      try {
        let storagePath = p.storage_path;
        if (!storagePath) {
          storagePath = buildAttachmentPath('execution', p.execution_id, p.file_name);
          const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, p.file);
          if (uploadError) {
            if (isNetworkError(uploadError)) {
              await offlineDB.updatePendingAttachment(p.id, { status: 'pendiente', attempts: p.attempts + 1, last_error: { message: uploadError.message } });
              remaining += 1;
            } else {
              await offlineDB.updatePendingAttachment(p.id, { status: 'conflicto', last_error: { message: uploadError.message } });
              newConflicts += 1;
              remaining += 1;
              console.warn(`[offlineSync] Adjunto ${p.id} en conflicto (upload):`, uploadError.message);
            }
            onItemDone();
            continue;
          }
          await offlineDB.updatePendingAttachment(p.id, { storage_path: storagePath });
        }

        const { data: { publicUrl } } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(storagePath);
        const { error: dbError } = await supabase.from('execution_attachments').insert({
          execution_id: p.execution_id,
          file_name: p.file_name,
          file_url: publicUrl,
          file_type: p.file_type,
          file_size: p.file_size,
          uploaded_by: p.uploaded_by,
          phase: p.phase ?? null,
          file_hash: p.file_hash ?? null,
        });

        if (dbError) {
          if (isNetworkError(dbError)) {
            await offlineDB.updatePendingAttachment(p.id, { status: 'pendiente', attempts: p.attempts + 1, last_error: { code: (dbError as any).code, message: dbError.message } });
          } else {
            await offlineDB.updatePendingAttachment(p.id, { status: 'conflicto', last_error: { code: (dbError as any).code, message: dbError.message } });
            newConflicts += 1;
            console.warn(`[offlineSync] Adjunto ${p.id} en conflicto (insert):`, dbError.message);
          }
          remaining += 1;
          onItemDone();
          continue;
        }

        await offlineDB.removePendingAttachment(p.id);
        synced += 1;
        console.log(`[offlineSync] Adjunto ${p.id} sincronizado.`);
      } catch (err: any) {
        await offlineDB.updatePendingAttachment(p.id, { status: 'pendiente', attempts: p.attempts + 1, last_error: { message: err?.message ?? 'Error desconocido' } });
        remaining += 1;
      }
      onItemDone();
    }

    queryClient.invalidateQueries({ queryKey: ['execution_attachments'] });
    queryClient.invalidateQueries({ queryKey: ['pending_attachments'] });
    queryClient.invalidateQueries({ queryKey: ['offline_conflicts'] });
    return { synced, newConflicts, remaining };
  }, [queryClient]);

  const triggerSync = useCallback(async () => {
    if (typeof window === 'undefined' || !window.navigator.onLine || !offlineDB) return;

    setSyncStatus('syncing');
    setLastSyncResult(null);
    try {
      const mutations = await offlineDB.getMutations();
      const commandsSnapshot = await offlineDB.getCommands();
      const attachmentsSnapshot = await offlineDB.getPendingAttachments();
      const total = mutations.length + commandsSnapshot.length + attachmentsSnapshot.length;

      if (total === 0) {
        setSyncStatus('synced');
        await checkStatus();
        return;
      }

      setSyncProgress({ done: 0, total });
      let done = 0;
      const onItemDone = () => setSyncProgress({ done: ++done, total });
      let syncedTotal = 0;
      let newConflictsTotal = 0;

      if (mutations.length > 0) {
        console.log(`[offlineSync] Starting sync for ${mutations.length} mutations...`);

        // Sincronizar en orden cronológico
        for (const mut of mutations) {
          if (mut.attempts >= 3) {
            console.warn(`[offlineSync] Skipping mutation ${mut.id} due to excessive failures:`, mut);
            await offlineDB.removeMutation(mut.id!);
            onItemDone();
            continue;
          }

          try {
            let error = null;

            if (mut.action === 'insert') {
              const { error: err } = await supabase.from(mut.table).insert(mut.payload);
              error = err;
            } else if (mut.action === 'update') {
              const { error: err } = await supabase.from(mut.table).update(mut.payload).eq('id', mut.payload.id);
              error = err;
            } else if (mut.action === 'delete') {
              const { error: err } = await supabase.from(mut.table).delete().eq('id', mut.payload.id);
              error = err;
            }

            if (error) {
              console.error(`[offlineSync] Mutation error on table ${mut.table}:`, error);
              await offlineDB.incrementAttempts(mut.id!);
              setSyncStatus('error');
              setSyncProgress(null);
              return; // Detener la cola de sincronización para mantener consistencia
            } else {
              console.log(`[offlineSync] Mutation ${mut.id} synced successfully.`);
              await offlineDB.removeMutation(mut.id!);
              syncedTotal += 1;
            }
          } catch (err) {
            console.error(`[offlineSync] Mutation transaction failed for ${mut.id}:`, err);
            await offlineDB.incrementAttempts(mut.id!);
            setSyncStatus('error');
            setSyncProgress(null);
            return;
          }
          onItemDone();
        }

        setLastSyncAt(new Date());
        await refreshLocalCache();
      }

      // Carriles 2 y 3: solo se intentan después de que el carril CRUD
      // terminó sin errores (ver nota sobre la dependencia entre carriles).
      // Son independientes entre sí.
      const commandsResult = await replayDomainCommands(onItemDone);
      const attachmentsResult = await syncPendingAttachments(onItemDone);
      syncedTotal += commandsResult.synced + attachmentsResult.synced;
      newConflictsTotal += commandsResult.newConflicts + attachmentsResult.newConflicts;
      const remaining = commandsResult.remaining + attachmentsResult.remaining;

      setSyncStatus(remaining > 0 ? 'error' : 'synced');
      setSyncProgress(null);
      if (syncedTotal > 0 || newConflictsTotal > 0) {
        setLastSyncResult({ synced: syncedTotal, conflicts: newConflictsTotal });
      }
      await checkStatus();
    } catch (e) {
      console.error('[offlineSync] Sync loop failed:', e);
      setSyncStatus('error');
      setSyncProgress(null);
    }
  }, [refreshLocalCache, replayDomainCommands, syncPendingAttachments, checkStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(window.navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkStatus();

    const interval = setInterval(checkStatus, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkStatus, triggerSync]);

  useEffect(() => {
    if (isOnline) {
      const timer = setTimeout(triggerSync, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, triggerSync]);

  const dismissLastSyncResult = useCallback(() => setLastSyncResult(null), []);

  return (
    <OfflineSyncContext.Provider value={{
      isOnline, syncStatus, pendingCount, conflictCount, lastSyncAt,
      syncProgress, lastSyncResult, triggerSync, refreshLocalCache, dismissLastSyncResult,
    }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSyncContext(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error('useOfflineSyncContext debe usarse dentro de <OfflineSyncProvider>');
  return ctx;
}
