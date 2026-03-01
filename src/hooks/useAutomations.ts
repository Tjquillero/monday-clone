'use client';

import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export interface AutomationRule {
  id: string;
  board_id: string;
  name: string;
  trigger_type: string;
  trigger_config: any;
  action_type: string;
  action_config: any;
  is_enabled: boolean;
}

export function useAutomations(boardId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // Fetch rules for the board
  const { data: rules, isLoading } = useQuery({
    queryKey: ['automations', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .eq('board_id', boardId);
      
      if (error) throw error;
      return data as AutomationRule[];
    },
    enabled: !!boardId
  });

  const createRule = useMutation({
    mutationFn: async (newRule: Omit<AutomationRule, 'id' | 'is_enabled'>) => {
      const { data, error } = await supabase
        .from('automations')
        .insert([{ ...newRule, board_id: boardId }])
        .select()
        .single();
        
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
    }
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
    }
  });

  const toggleRule = useMutation({
    mutationFn: async ({ ruleId, isEnabled }: { ruleId: string, isEnabled: boolean }) => {
      const { error } = await supabase
        .from('automations')
        .update({ is_enabled: isEnabled })
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', boardId] });
    }
  });

  const executeAutomations = async (triggerType: string, itemId: string, itemContext: any) => {
    // Only execute enabled rules
    const enabledRules = rules?.filter(r => r.is_enabled) || [];
    if (enabledRules.length === 0) return;

    const applicableRules = enabledRules.filter(r => r.trigger_type === triggerType);
    console.log(`[Automation] Checking ${applicableRules.length} rules for ${triggerType} on item ${itemId}`);

    for (const rule of applicableRules) {
      try {
        await processRule(rule, itemId, itemContext);
      } catch (err) {
        console.error(`[Automation] Error executing rule ${rule.name}:`, err);
      }
    }
  };

  const processRule = async (rule: AutomationRule, itemId: string, context: any) => {
    // 1. Evaluate Trigger Condition
    if (rule.trigger_type === 'status_change') {
      const { column_id, value } = rule.trigger_config;
      
      // If trigger value is 'ANY', it fires for any change
      // Otherwise, check if current value matches target
      if (value !== 'ANY' && context.values?.[column_id] !== value) return;

      // SPECIAL CASE: Mandatory Evidence Rule
      if (rule.action_type === 'verify_evidence' || rule.trigger_config.verify_evidence) {
        // ... (existing logic remains)
        const { data: attachments } = await supabase
          .from('attachments')
          .select('id')
          .eq('item_id', itemId)
          .limit(1);

        if (!attachments || attachments.length === 0) {
          console.log(`[Automation] Rule ${rule.name} failed: No evidence found.`);
          
          // Revert Status
          const previousStatus = context.previous_values?.[column_id] || 'Working on it';
          await supabase.from('items').update({
            values: { ...context.values, [column_id]: previousStatus }
          }).eq('id', itemId);

          // Notify User
          await createNotification({
            user_id: context.updated_by,
            title: 'Evidencia Obligatoria',
            message: `No se puede marcar como "${context.values?.[column_id]}" sin cargar fotos de evidencia.`,
            type: 'warning',
            link: `/dashboard?item=${itemId}`
          });

          return; // Stop execution
        }
      }
    }

    // 2. Execute Action
    if (rule.action_type === 'notify') {
      await createNotification({
        user_id: rule.action_config.user_id || context.updated_by,
        title: rule.name,
        message: rule.action_config.message || 'Acción automatizada activada',
        type: 'info'
      });
    }

    if (rule.action_type === 'set_value') {
      const { column_id, value } = rule.action_config;
      await supabase.from('items').update({
        values: { ...context.values, [column_id]: value }
      }).eq('id', itemId);
    }
  };

  const createNotification = async (notif: any) => {
    const { error } = await supabase.from('notifications').insert([notif]);
    if (error) console.error('[Automation] Error creating notification:', error);
  };

  const processExecutionUpdate = async (itemId: string | number, values: any) => {
    // 1. Calculate progress
    const total = Number(values.cant) || 0;
    const executed = Object.values(values.daily_execution || {}).reduce((acc: number, curr: any) => {
        if (typeof curr === 'object' && curr !== null) {
            return acc + (curr.done ? (Number(curr.val) || 0) : 0);
        }
        return acc + (Number(curr) || 0);
    }, 0);
    const progress = total > 0 ? (executed / total) * 100 : 0;

    // 2. Determine needed status
    let neededStatus = values.status || 'Not Started';
    
    if (progress >= 100) {
        if (neededStatus !== 'Done') neededStatus = 'Done';
    } else if (progress > 0) {
        if (neededStatus !== 'Working on it' && neededStatus !== 'Done') neededStatus = 'Working on it';
    }

    return neededStatus !== values.status ? neededStatus : null;
  };

  return { 
    rules, 
    isLoading, 
    createRule, 
    deleteRule, 
    toggleRule, 
    executeAutomations, 
    processExecutionUpdate 
  };
}
