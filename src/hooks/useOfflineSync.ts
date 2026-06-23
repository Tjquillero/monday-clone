// src/hooks/useOfflineSync.ts
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB } from '@/lib/offlineDB';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const online = window.navigator.onLine;
    setIsOnline(online);

    if (offlineDB) {
      try {
        const mutations = await offlineDB.getMutations();
        setPendingCount(mutations.length);
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
        'task_dependencies'
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

  const triggerSync = useCallback(async () => {
    if (typeof window === 'undefined' || !window.navigator.onLine || !offlineDB) return;
    
    setSyncStatus('syncing');
    try {
      const mutations = await offlineDB.getMutations();
      if (mutations.length === 0) {
        setSyncStatus('synced');
        setPendingCount(0);
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

      setPendingCount(0);
      setSyncStatus('synced');
      setLastSyncAt(new Date());
      
      // Actualizar instantáneas locales
      await refreshLocalCache();
    } catch (e) {
      console.error('[offlineSync] Sync loop failed:', e);
      setSyncStatus('error');
    }
  }, [refreshLocalCache]);

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
    lastSyncAt,
    triggerSync,
    refreshLocalCache
  };
}
