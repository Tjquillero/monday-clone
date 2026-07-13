'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAutomations } from '@/hooks/useAutomations';
import { useAuth } from '@/contexts/AuthContext';
import { Column, Dependency, Group } from '@/types/monday';
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

export function useBoardMutations(boardId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { executeAutomations, processExecutionUpdate } = useAutomations(boardId);

  // Helper: Recursive Rescheduling (Internal to mutation logic)
  const rescheduleSuccessors = async (itemId: string, newEndDate: string, taskDependencies: Dependency[], groups: Group[]) => {
    const successors = taskDependencies.filter(dep => String(dep.source_item_id) === String(itemId));
    
    for (const dep of successors) {
      const successorItem = groups.flatMap(g => g.items).find(i => String(i.id) === String(dep.target_item_id));
      if (!successorItem) continue;

      const predEnd = new Date(newEndDate);
      const newStart = new Date(predEnd);
      newStart.setDate(predEnd.getDate() + 1 + (dep.lag || 0));
      
      const newStartStr = newStart.toISOString().split('T')[0];
      const currentTimeline = successorItem.values['timeline'];
      
      let duration = 1;
      if (currentTimeline?.from && currentTimeline?.to) {
        const d1 = new Date(currentTimeline.from);
        const d2 = new Date(currentTimeline.to);
        duration = Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      const newEnd = new Date(newStart);
      newEnd.setDate(newStart.getDate() + duration);
      const newEndStr = newEnd.toISOString().split('T')[0];

      if (currentTimeline?.from !== newStartStr) {
        const mergedVal = { ...successorItem.values, timeline: { from: newStartStr, to: newEndStr } };
        try {
          const { error } = await supabase.from('items').update({
            values: mergedVal
          }).eq('id', successorItem.id);
          
          if (error) throw error;

          if (offlineDB) {
            const localItems = await offlineDB.getTable('items');
            const idx = localItems.findIndex((i: any) => String(i.id) === String(successorItem.id));
            if (idx !== -1) {
              localItems[idx].values = mergedVal;
              await offlineDB.saveTable('items', localItems);
            }
          }
        } catch (rescheduleErr) {
          if (isNetworkError(rescheduleErr) && offlineDB) {
            const localItems = await offlineDB.getTable('items');
            const idx = localItems.findIndex((i: any) => String(i.id) === String(successorItem.id));
            if (idx !== -1) {
              localItems[idx].values = mergedVal;
              await offlineDB.saveTable('items', localItems);
            }

            await offlineDB.addMutation({
              table: 'items',
              action: 'update',
              payload: { id: successorItem.id, values: mergedVal }
            });
          } else {
            throw rescheduleErr;
          }
        }

        await rescheduleSuccessors(String(successorItem.id), newEndStr, taskDependencies, groups);
      }
    }
  };

  const addItem = useMutation({
    mutationFn: async ({ groupId, name, initialValues }: { groupId: string, name: string, initialValues: any }) => {
      try {
        const { data, error } = await supabase.from('items').insert({
          group_id: groupId,
          name: name,
          values: initialValues,
          position: 999 
        }).select().single();
        
        if (error) throw error;

        if (offlineDB && data) {
          await offlineDB.upsertRecords('items', [data]);
        }
        return data;
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Add item failed due to network. Queuing mutation.');
          const newId = generateUUID();
          const newItem = {
            id: newId,
            group_id: groupId,
            name: name,
            values: initialValues,
            position: 999,
            created_at: new Date().toISOString()
          };

          const localItems = await offlineDB.getTable('items');
          localItems.push(newItem);
          await offlineDB.saveTable('items', localItems);

          await offlineDB.addMutation({
            table: 'items',
            action: 'insert',
            payload: newItem
          });

          return newItem;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
  });

  const createOrGetFinancialItem = useMutation({
    mutationFn: async ({ groupId, name, initialValues }: { groupId: string, name: string, initialValues: any }) => {
      try {
        // Online: call RPC get_or_create_financial_item
        const { data, error } = await supabase.rpc('get_or_create_financial_item', {
          p_group_id: groupId,
          p_name: name,
          p_values: initialValues
        });

        if (error) {
          console.warn('[RPC fallback] get_or_create_financial_item failed, falling back to select-or-insert:', error);
          const { data: existing, error: findError } = await supabase
            .from('items')
            .select('*')
            .eq('group_id', groupId)
            .eq('name', name)
            .limit(1);

          if (!findError && existing && existing.length > 0) {
            return existing[0];
          }

          const { data: inserted, error: insertError } = await supabase.from('items').insert({
            group_id: groupId,
            name: name,
            values: initialValues,
            position: 999 
          }).select().single();

          if (insertError) throw insertError;
          return inserted;
        }

        if (offlineDB && data) {
          await offlineDB.upsertRecords('items', [data]);
        }
        return data;
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] createOrGetFinancialItem failed due to network. Checking local DB.');
          const localItems = await offlineDB.getTable('items');
          const match = localItems.find((item: any) => String(item.group_id) === String(groupId) && item.name === name);
          if (match) {
            console.log('[Offline Idempotent] Returning local match:', match.id);
            return match;
          }

          const newId = generateUUID();
          const newItem = {
            id: newId,
            group_id: groupId,
            name: name,
            values: initialValues,
            position: 999,
            created_at: new Date().toISOString()
          };

          localItems.push(newItem);
          await offlineDB.saveTable('items', localItems);

          await offlineDB.addMutation({
            table: 'items',
            action: 'insert',
            payload: newItem
          });

          return newItem;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, updates, isValuesUpdate }: { itemId: string | number, updates: any, isValuesUpdate: boolean }) => {
      try {
        if (isValuesUpdate) {
          let currentValues = {};
          try {
            const { data: current, error: fetchErr } = await supabase.from('items').select('values').eq('id', itemId).single();
            if (fetchErr) throw fetchErr;
            currentValues = current?.values || {};
          } catch (fetchErr) {
            if (isNetworkError(fetchErr) && offlineDB) {
              const localItems = await offlineDB.getTable('items');
              const localItem = localItems.find((i: any) => String(i.id) === String(itemId));
              currentValues = localItem?.values || {};
            } else {
              throw fetchErr;
            }
          }

          const mergedValues = { ...currentValues, ...updates };
          
          const statusUpdate = await processExecutionUpdate(itemId, mergedValues);
          if (statusUpdate) {
              mergedValues.status = statusUpdate;
          }

          try {
            const { error } = await supabase.from('items').update({ values: mergedValues }).eq('id', itemId);
            if (error) throw error;

            if (offlineDB) {
              const localItems = await offlineDB.getTable('items');
              const idx = localItems.findIndex((i: any) => String(i.id) === String(itemId));
              if (idx !== -1) {
                localItems[idx].values = mergedValues;
                await offlineDB.saveTable('items', localItems);
              }
            }

            // Trigger Automations
            if (user) {
              await executeAutomations('status_change', String(itemId), {
                values: mergedValues,
                previous_values: currentValues,
                updated_by: user.id
              });
            }

            // Trigger Rescheduling if timeline changed
            if (updates.timeline?.to) {
              const deps = queryClient.getQueryData<Dependency[]>(['task_dependencies', boardId]) || [];
              const groups = queryClient.getQueryData<Group[]>(['groups', boardId]) || [];
              await rescheduleSuccessors(String(itemId), updates.timeline.to, deps, groups);
            }
          } catch (updateErr) {
            if (isNetworkError(updateErr) && offlineDB) {
              console.log('[Offline] Update item values failed due to network. Queuing mutation.');
              
              const localItems = await offlineDB.getTable('items');
              const idx = localItems.findIndex((i: any) => String(i.id) === String(itemId));
              if (idx !== -1) {
                localItems[idx].values = mergedValues;
                await offlineDB.saveTable('items', localItems);
              }

              await offlineDB.addMutation({
                table: 'items',
                action: 'update',
                payload: { id: itemId, values: mergedValues }
              });
            } else {
              throw updateErr;
            }
          }
        } else {
          try {
            const { error } = await supabase.from('items').update(updates).eq('id', itemId);
            if (error) throw error;

            if (offlineDB) {
              const localItems = await offlineDB.getTable('items');
              const idx = localItems.findIndex((i: any) => String(i.id) === String(itemId));
              if (idx !== -1) {
                localItems[idx] = { ...localItems[idx], ...updates };
                await offlineDB.saveTable('items', localItems);
              }
            }
          } catch (updateErr) {
            if (isNetworkError(updateErr) && offlineDB) {
              console.log('[Offline] Update item fields failed due to network. Queuing mutation.');
              
              const localItems = await offlineDB.getTable('items');
              const idx = localItems.findIndex((i: any) => String(i.id) === String(itemId));
              if (idx !== -1) {
                localItems[idx] = { ...localItems[idx], ...updates };
                await offlineDB.saveTable('items', localItems);
              }

              await offlineDB.addMutation({
                table: 'items',
                action: 'update',
                payload: { id: itemId, ...updates }
              });
            } else {
              throw updateErr;
            }
          }
        }
      } catch (err) {
        throw err;
      }
    },
    onMutate: async ({ itemId, updates, isValuesUpdate }) => {
      await queryClient.cancelQueries({ queryKey: ['groups', boardId] });
      const previousGroups = queryClient.getQueryData<Group[]>(['groups', boardId]);

      if (previousGroups) {
        queryClient.setQueryData<Group[]>(['groups', boardId], old => {
          if (!old) return [];
          return old.map(group => ({
            ...group,
            items: group.items.map(item => {
              if (String(item.id) === String(itemId)) {
                if (isValuesUpdate) {
                  return { ...item, values: { ...item.values, ...updates } };
                } else {
                  return { ...item, ...updates };
                }
              }
              return item;
            })
          }));
        });
      }

      return { previousGroups };
    },
    onError: (err, variables, context) => {
      console.error("❌ MUTATION ERROR:", err);
      if (isNetworkError(err)) {
        console.log('[Offline] Mutation failure handled gracefully. Change will sync later.');
        return;
      }
      if (context?.previousGroups) {
        queryClient.setQueryData(['groups', boardId], context.previousGroups);
      }
      alert("❌ Error al guardar en base de datos: " + (err as any).message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
  });

  const deleteItems = useMutation({
    mutationFn: async (itemIds: (string | number)[]) => {
      try {
        const stringIds = itemIds.map(String);

        // 1. Delete children first
        await supabase.from('items').delete().in('parent_id', itemIds);
        
        // 2. Delete the items themselves
        const { error } = await supabase.from('items').delete().in('id', itemIds);
        if (error) throw error;

        if (offlineDB) {
          const localItems = await offlineDB.getTable('items');
          const remaining = localItems.filter((i: any) => 
            !stringIds.includes(String(i.id)) && !stringIds.includes(String(i.parent_id))
          );
          await offlineDB.saveTable('items', remaining);
        }
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Delete items failed due to network. Queuing mutations.');
          const stringIds = itemIds.map(String);

          const localItems = await offlineDB.getTable('items');
          const remaining = localItems.filter((i: any) => 
            !stringIds.includes(String(i.id)) && !stringIds.includes(String(i.parent_id))
          );
          await offlineDB.saveTable('items', remaining);

          for (const id of itemIds) {
            await offlineDB.addMutation({
              table: 'items',
              action: 'delete',
              payload: { parent_id: id }
            });
            await offlineDB.addMutation({
              table: 'items',
              action: 'delete',
              payload: { id: id }
            });
          }
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
    onError: (err: any) => {
      if (isNetworkError(err)) return;
      console.error("❌ ERROR AL ELIMINAR ITEMS:", err);
      alert("Error al eliminar los ítems: " + (err?.message || "Error desconocido"));
    }
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string | number) => {
      try {
        // 1. Delete children first
        await supabase.from('items').delete().eq('parent_id', itemId);
        
        // 2. Delete the item
        const { error } = await supabase.from('items').delete().eq('id', itemId);
        if (error) throw error;

        if (offlineDB) {
          const localItems = await offlineDB.getTable('items');
          const remaining = localItems.filter((i: any) => String(i.id) !== String(itemId) && String(i.parent_id) !== String(itemId));
          await offlineDB.saveTable('items', remaining);
        }
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Delete item failed due to network. Queuing mutation.');

          const localItems = await offlineDB.getTable('items');
          const remaining = localItems.filter((i: any) => String(i.id) !== String(itemId) && String(i.parent_id) !== String(itemId));
          await offlineDB.saveTable('items', remaining);

          await offlineDB.addMutation({
            table: 'items',
            action: 'delete',
            payload: { parent_id: itemId }
          });

          await offlineDB.addMutation({
            table: 'items',
            action: 'delete',
            payload: { id: itemId }
          });
          
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
    onError: (err: any) => {
      if (isNetworkError(err)) return;
      console.error("❌ ERROR AL ELIMINAR ITEM:", err);
      alert("Error al eliminar el ítem: " + (err?.message || "Error desconocido"));
    }
  });

  return {
    addItem,
    createOrGetFinancialItem,
    updateItem,
    deleteItem,
    deleteItems
  };
}
