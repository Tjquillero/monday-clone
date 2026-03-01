'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAutomations } from '@/hooks/useAutomations';
import { useAuth } from '@/contexts/AuthContext';
import { Column, Dependency, Group } from '@/types/monday';

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
        await supabase.from('items').update({
          values: { ...successorItem.values, timeline: { from: newStartStr, to: newEndStr } }
        }).eq('id', successorItem.id);

        await rescheduleSuccessors(String(successorItem.id), newEndStr, taskDependencies, groups);
      }
    }
  };

  const addItem = useMutation({
    mutationFn: async ({ groupId, name, initialValues }: { groupId: string, name: string, initialValues: any }) => {
      const { data, error } = await supabase.from('items').insert({
        group_id: groupId,
        name: name,
        values: initialValues,
        position: 999 
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, updates, isValuesUpdate }: { itemId: string | number, updates: any, isValuesUpdate: boolean }) => {
      if (isValuesUpdate) {
        const { data: current } = await supabase.from('items').select('values').eq('id', itemId).single();
        const mergedValues = { ...(current?.values || {}), ...updates };
        
        const statusUpdate = await processExecutionUpdate(itemId, mergedValues);
        if (statusUpdate) {
            mergedValues.status = statusUpdate;
            // Note: In a real app we'd also update the specific status column ID.
        }

        const { error } = await supabase.from('items').update({ values: mergedValues }).eq('id', itemId);
        if (error) throw error;

        // Trigger Automations
        if (user) {
          await executeAutomations('status_change', String(itemId), {
            values: mergedValues,
            previous_values: current?.values,
            updated_by: user.id
          });
        }

        // Trigger Rescheduling if timeline changed
        if (updates.timeline?.to) {
          const deps = queryClient.getQueryData<Dependency[]>(['task_dependencies', boardId]) || [];
          const groups = queryClient.getQueryData<Group[]>(['groups', boardId]) || [];
          await rescheduleSuccessors(String(itemId), updates.timeline.to, deps, groups);
        }
      } else {
        const { error } = await supabase.from('items').update(updates).eq('id', itemId);
        if (error) throw error;
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
      console.error("❌ MUTATION ERROR:", err); // DEBUG LOG
      if (context?.previousGroups) {
        queryClient.setQueryData(['groups', boardId], context.previousGroups);
      }
      alert("❌ Error al guardar en base de datos: " + (err as any).message); // VISIBLE ALERT
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string | number) => {
      const { error } = await supabase.from('items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
    },
    onError: (err: any) => {
      console.error("❌ ERROR AL ELIMINAR ITEM:", err);
      alert("Error al eliminar el ítem de la base de datos: " + (err?.message || JSON.stringify(err)));
    }
  });

  return {
    addItem,
    updateItem,
    deleteItem
  };
}
