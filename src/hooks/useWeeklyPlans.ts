'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { WeeklyPlan, WeeklyPlanItem, WeeklyPlanItemExecution } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const weeklyPlanKeys = {
  all:        (boardId: string)              => ['weekly_plans', boardId] as const,
  byGroup:    (boardId: string, groupId: string) => ['weekly_plans', boardId, groupId] as const,
  plan:       (planId: string)               => ['weekly_plan', planId] as const,
  items:      (planId: string)               => ['weekly_plan_items', planId] as const,
  executions: (planItemId: string)           => ['weekly_plan_executions', planItemId] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlans
//
// Lista de planes para un board, opcionalmente filtrados por sitio.
// Ordered by week_start DESC so the most recent plan appears first.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlans(boardId: string | undefined, groupId?: string | null) {
  return useQuery<WeeklyPlan[]>({
    queryKey: groupId
      ? weeklyPlanKeys.byGroup(boardId!, groupId)
      : weeklyPlanKeys.all(boardId!),
    queryFn: async () => {
      let query = supabase
        .from('weekly_plans')
        .select('*')
        .eq('board_id', boardId!)
        .order('week_start', { ascending: false });

      if (groupId) query = query.eq('group_id', groupId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as WeeklyPlan[];
    },
    enabled: !!boardId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanWithItems
//
// Plan individual + sus items ordenados por planned_sequence.
// Usado cuando el asistente edita o revisa un plan específico.
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklyPlanWithItems {
  plan: WeeklyPlan;
  items: WeeklyPlanItem[];
}

export function useWeeklyPlanWithItems(planId: string | undefined) {
  return useQuery<WeeklyPlanWithItems>({
    queryKey: weeklyPlanKeys.plan(planId!),
    queryFn: async () => {
      const [planRes, itemsRes] = await Promise.all([
        supabase.from('weekly_plans').select('*').eq('id', planId!).single(),
        supabase
          .from('weekly_plan_items')
          .select('*')
          .eq('plan_id', planId!)
          .order('planned_sequence', { ascending: true }),
      ]);

      if (planRes.error) throw planRes.error;
      if (itemsRes.error) throw itemsRes.error;

      return {
        plan: planRes.data as WeeklyPlan,
        items: (itemsRes.data ?? []) as WeeklyPlanItem[],
      };
    },
    enabled: !!planId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanExecutions
//
// Ejecuciones de un item específico, ordenadas por fecha.
// Se usa en la UI de registro de ejecución del líder.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlanExecutions(planItemId: string | undefined) {
  return useQuery<WeeklyPlanItemExecution[]>({
    queryKey: weeklyPlanKeys.executions(planItemId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_plan_item_executions')
        .select('*')
        .eq('plan_item_id', planItemId!)
        .order('execution_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as WeeklyPlanItemExecution[];
    },
    enabled: !!planItemId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}
