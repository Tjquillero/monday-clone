'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB, generateUUID } from '@/lib/offlineDB';

function isNetworkError(error: any): boolean {
  if (!error) return false;
  if (typeof window !== 'undefined' && !window.navigator.onLine) return true;
  
  const msg = (error.message || '').toLowerCase();
  const name = (error.name || '').toLowerCase();
  
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('load failed') ||
    msg.includes('connection') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    name.includes('aborterror') ||
    name.includes('typeerror') ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  );
}

// 1. Obtener listado de órdenes de trabajo (sin borrado lógico)
export function useWorkOrders() {
  return useQuery({
    queryKey: ['work_orders'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('work_orders')
          .select('*, status:work_order_statuses(*), priority:work_order_priorities(*), type:work_order_types(*)')
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (offlineDB && data) {
          await offlineDB.saveTable('work_orders', data);
        }
        return data;
      } catch (err) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Cargando órdenes de trabajo locales.');
          return await offlineDB.getTable('work_orders');
        }
        throw err;
      }
    }
  });
}

// 2. Obtener los detalles de una única orden de trabajo
export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: ['work_order', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        // Ejecutar consultas en paralelo
        const [
          orderRes,
          tasksRes,
          materialsRes,
          sparePartsRes,
          assignmentsRes,
          commentsRes,
          attachmentsRes,
          historyRes
        ] = await Promise.all([
          supabase.from('work_orders').select('*, status:work_order_statuses(*), priority:work_order_priorities(*), type:work_order_types(*)').eq('id', id).single(),
          supabase.from('work_order_tasks').select('*').eq('work_order_id', id).order('position', { ascending: true }),
          supabase.from('work_order_materials').select('*').eq('work_order_id', id),
          supabase.from('work_order_spare_parts').select('*').eq('work_order_id', id),
          supabase.from('work_order_assignments').select('*').eq('work_order_id', id).is('removed_at', null),
          supabase.from('work_order_comments').select('*').eq('work_order_id', id).order('created_at', { ascending: true }),
          supabase.from('entity_attachments').select('*').eq('entity_type', 'work_order').eq('entity_id', id).is('deleted_at', null),
          supabase.from('entity_history').select('*').eq('entity_type', 'work_order').eq('entity_id', id).order('created_at', { ascending: false })
        ]);

        if (orderRes.error) throw orderRes.error;

        const detail = {
          ...orderRes.data,
          tasks: tasksRes.data || [],
          materials: materialsRes.data || [],
          spareParts: sparePartsRes.data || [],
          assignments: assignmentsRes.data || [],
          comments: commentsRes.data || [],
          attachments: attachmentsRes.data || [],
          history: historyRes.data || []
        };

        if (offlineDB) {
          await offlineDB.upsertRecords('work_orders', [detail]);
        }
        return detail;
      } catch (err) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Cargando orden de trabajo detallada local.');
          const localOrders = await offlineDB.getTable('work_orders');
          return localOrders.find((o: any) => String(o.id) === String(id)) || null;
        }
        throw err;
      }
    },
    enabled: !!id
  });
}

// 3. Crear una nueva orden de trabajo
export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newOrder: any) => {
      try {
        const { data, error } = await supabase
          .from('work_orders')
          .insert({
            ...newOrder,
            version: 1
          })
          .select()
          .single();

        if (error) throw error;

        if (offlineDB && data) {
          await offlineDB.upsertRecords('work_orders', [data]);
        }
        return data;
      } catch (err) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Registrando creación de OT localmente.');
          const id = generateUUID();
          const tempRecord = {
            id,
            ...newOrder,
            number: Date.now(), // Temporal hasta sync
            display_number: 'OT-TEMP',
            version: 1,
            created_at: new Date().toISOString()
          };

          const local = await offlineDB.getTable('work_orders');
          local.push(tempRecord);
          await offlineDB.saveTable('work_orders', local);

          await offlineDB.addMutation({
            table: 'work_orders',
            action: 'insert',
            payload: tempRecord
          });

          return tempRecord;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work_orders'] });
    }
  });
}

// 4. Actualizar una orden de trabajo (versionado optimista)
export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates, currentVersion }: { id: string, updates: any, currentVersion: number }) => {
      try {
        // Control de concurrencia optimista
        const { data, error } = await supabase
          .from('work_orders')
          .update({
            ...updates,
            version: currentVersion + 1
          })
          .eq('id', id)
          .eq('version', currentVersion)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('Conflicto de edición concurrente: La orden fue modificada por otro usuario. Por favor recarga los datos.');
          }
          throw error;
        }

        if (offlineDB && data) {
          await offlineDB.upsertRecords('work_orders', [data]);
        }
        return data;
      } catch (err) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Guardando actualización de OT localmente.');
          const local = await offlineDB.getTable('work_orders');
          const idx = local.findIndex((o: any) => String(o.id) === String(id));
          if (idx !== -1) {
            local[idx] = { ...local[idx], ...updates, version: currentVersion + 1 };
            await offlineDB.saveTable('work_orders', local);
          }

          await offlineDB.addMutation({
            table: 'work_orders',
            action: 'update',
            payload: { id, updates, currentVersion }
          });

          return { id, ...updates };
        }
        throw err;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work_orders'] });
      queryClient.invalidateQueries({ queryKey: ['work_order', variables.id] });
    }
  });
}

// 5. Borrado lógico (Soft Delete)
export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string, userId: string }) => {
      try {
        const { error } = await supabase
          .from('work_orders')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: userId
          })
          .eq('id', id);

        if (error) throw error;

        if (offlineDB) {
          const local = await offlineDB.getTable('work_orders');
          const filtered = local.filter((o: any) => String(o.id) !== String(id));
          await offlineDB.saveTable('work_orders', filtered);
        }
      } catch (err) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Marcando soft delete de OT localmente.');
          const local = await offlineDB.getTable('work_orders');
          const filtered = local.filter((o: any) => String(o.id) !== String(id));
          await offlineDB.saveTable('work_orders', filtered);

          await offlineDB.addMutation({
            table: 'work_orders',
            action: 'update',
            payload: { id, updates: { deleted_at: new Date().toISOString(), deleted_by: userId }, currentVersion: 1 }
          });
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work_orders'] });
    }
  });
}
