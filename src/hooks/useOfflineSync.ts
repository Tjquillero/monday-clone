// src/hooks/useOfflineSync.ts
import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB, DomainCommand, PendingAttachment } from '@/lib/offlineDB';
import { isNetworkError } from './useBoardData';
import { ATTACHMENT_BUCKET, buildAttachmentPath } from '@/lib/storageUtils';

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [conflictCount, setConflictCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

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
        // 'conflicto' es un subconjunto de lo pendiente que NUNCA se resuelve
        // solo (Sección 5 del diseño offline) — se cuenta aparte para que la
        // bandeja de conflictos sepa si hay algo que mostrar sin tener que
        // adivinar a partir del conteo genérico.
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
        'boards',
        'groups',
        'items',
        'site_incidents',
        'board_columns',
        'activity_templates',
        'task_dependencies',
        // Ejecución Certificada — Incremento 1 de offline-certification-design.md
        'weekly_plans',
        'weekly_plan_items',
        'weekly_plan_item_executions',
        'board_activity_standards',
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

  // Carril 2 (comandos de dominio): "un fallo transitorio se reintenta; un
  // fallo semántico nunca se reintenta solo" (offline-certification-design.md,
  // Sección 5) — por eso este replay NUNCA descarta un comando en conflicto
  // como sí hace el carril CRUD con sus 3 intentos. Solo se llama después de
  // que el carril CRUD terminó sin errores: REPORT_EXECUTION depende de que
  // la ejecución exista en el servidor, y esa creación viaja por el carril 1
  // (createExecution usa supabase.from(), no RPC) — simplificación deliberada
  // de secuenciación en vez de un grafo depends_on entre carriles.
  const replayDomainCommands = useCallback(async (): Promise<number> => {
    if (!offlineDB || typeof window === 'undefined' || !window.navigator.onLine) return 0;
    const commands: DomainCommand[] = await offlineDB.getCommands();
    if (commands.length === 0) return 0;

    console.log(`[offlineSync] Starting sync for ${commands.length} domain commands...`);
    const stillQueuedIds = new Set(commands.map((c) => c.id));
    let remaining = 0;

    for (const cmd of commands) {
      if (cmd.status === 'conflicto') { remaining += 1; continue; } // requiere intervención humana
      if (cmd.depends_on && stillQueuedIds.has(cmd.depends_on)) { remaining += 1; continue; }

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
          console.log(`[offlineSync] Comando ${cmd.type} (${cmd.id}) sincronizado.`);
        } else if (isNetworkError(error)) {
          await offlineDB.updateCommand(cmd.id, { attempts: cmd.attempts + 1, last_error: { code: error.code, message: error.message } });
          remaining += 1;
        } else {
          await offlineDB.updateCommand(cmd.id, { status: 'conflicto', last_error: { code: error.code, message: error.message } });
          remaining += 1;
          console.warn(`[offlineSync] Comando ${cmd.type} (${cmd.id}) en conflicto:`, error.message);
        }
      } catch (err: any) {
        await offlineDB.updateCommand(cmd.id, { attempts: cmd.attempts + 1, last_error: { message: err?.message ?? 'Error desconocido' } });
        remaining += 1;
      }
    }

    queryClient.invalidateQueries({ queryKey: ['domain_commands'] });
    queryClient.invalidateQueries({ queryKey: ['offline_conflicts'] });
    return remaining;
  }, [queryClient]);

  // Carril 3 (Blobs de evidencia): mismo principio que el carril 2 — nunca
  // descarta un adjunto en conflicto, y solo se intenta después de que el
  // carril CRUD terminó sin errores (la ejecución padre debe existir en el
  // servidor). `storage_path` se persiste apenas el upload a Storage tiene
  // éxito, así un reintento (por ejemplo si el INSERT posterior falló por
  // red) no vuelve a subir el mismo archivo con una ruta nueva.
  const syncPendingAttachments = useCallback(async (): Promise<number> => {
    if (!offlineDB || typeof window === 'undefined' || !window.navigator.onLine) return 0;
    const pendings: PendingAttachment[] = await offlineDB.getPendingAttachments();
    if (pendings.length === 0) return 0;

    console.log(`[offlineSync] Starting sync for ${pendings.length} pending attachments...`);
    let remaining = 0;

    for (const p of pendings) {
      if (p.status === 'conflicto') { remaining += 1; continue; }

      try {
        let storagePath = p.storage_path;
        if (!storagePath) {
          storagePath = buildAttachmentPath('execution', p.execution_id, p.file_name);
          const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, p.file);
          if (uploadError) {
            if (isNetworkError(uploadError)) {
              await offlineDB.updatePendingAttachment(p.id, { attempts: p.attempts + 1, last_error: { message: uploadError.message } });
            } else {
              await offlineDB.updatePendingAttachment(p.id, { status: 'conflicto', last_error: { message: uploadError.message } });
              console.warn(`[offlineSync] Adjunto ${p.id} en conflicto (upload):`, uploadError.message);
            }
            remaining += 1;
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
        });

        if (dbError) {
          if (isNetworkError(dbError)) {
            await offlineDB.updatePendingAttachment(p.id, { attempts: p.attempts + 1, last_error: { code: (dbError as any).code, message: dbError.message } });
          } else {
            await offlineDB.updatePendingAttachment(p.id, { status: 'conflicto', last_error: { code: (dbError as any).code, message: dbError.message } });
            console.warn(`[offlineSync] Adjunto ${p.id} en conflicto (insert):`, dbError.message);
          }
          remaining += 1;
          continue;
        }

        await offlineDB.removePendingAttachment(p.id);
        console.log(`[offlineSync] Adjunto ${p.id} sincronizado.`);
      } catch (err: any) {
        await offlineDB.updatePendingAttachment(p.id, { attempts: p.attempts + 1, last_error: { message: err?.message ?? 'Error desconocido' } });
        remaining += 1;
      }
    }

    queryClient.invalidateQueries({ queryKey: ['execution_attachments'] });
    queryClient.invalidateQueries({ queryKey: ['pending_attachments'] });
    queryClient.invalidateQueries({ queryKey: ['offline_conflicts'] });
    return remaining;
  }, [queryClient]);

  const triggerSync = useCallback(async () => {
    if (typeof window === 'undefined' || !window.navigator.onLine || !offlineDB) return;

    setSyncStatus('syncing');
    try {
      const mutations = await offlineDB.getMutations();
      if (mutations.length === 0) {
        const remainingCommands = await replayDomainCommands();
        const remainingAttachments = await syncPendingAttachments();
        const remaining = remainingCommands + remainingAttachments;
        setSyncStatus(remaining > 0 ? 'error' : 'synced');
        await checkStatus(); // recalcula pendingCount Y conflictCount desde IndexedDB
        return;
      }

      console.log(`[offlineSync] Starting sync for ${mutations.length} mutations...`);

      // Sincronizar en orden cronológico
      for (const mut of mutations) {
        if (mut.attempts >= 3) {
          console.warn(`[offlineSync] Skipping mutation ${mut.id} due to excessive failures:`, mut);
          await offlineDB.removeMutation(mut.id!);
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
            return; // Detener la cola de sincronización para mantener consistencia
          } else {
            console.log(`[offlineSync] Mutation ${mut.id} synced successfully.`);
            await offlineDB.removeMutation(mut.id!);
          }
        } catch (err) {
          console.error(`[offlineSync] Mutation transaction failed for ${mut.id}:`, err);
          await offlineDB.incrementAttempts(mut.id!);
          setSyncStatus('error');
          return;
        }
      }

      setLastSyncAt(new Date());

      // Actualizar instantáneas locales
      await refreshLocalCache();

      // Carriles 2 y 3: solo se intentan después de que el carril CRUD
      // terminó sin errores (ver nota en replayDomainCommands/syncPendingAttachments
      // sobre la dependencia entre carriles). Son independientes entre sí.
      const remainingCommands = await replayDomainCommands();
      const remainingAttachments = await syncPendingAttachments();
      const remaining = remainingCommands + remainingAttachments;
      setSyncStatus(remaining > 0 ? 'error' : 'synced');
      await checkStatus(); // recalcula pendingCount Y conflictCount desde IndexedDB
    } catch (e) {
      console.error('[offlineSync] Sync loop failed:', e);
      setSyncStatus('error');
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

  return {
    isOnline,
    syncStatus,
    pendingCount,
    conflictCount,
    lastSyncAt,
    triggerSync,
    refreshLocalCache
  };
}
