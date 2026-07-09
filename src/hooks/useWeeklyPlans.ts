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
  publishedWeek: (weekStartISO: string)      => ['weekly_plans', 'published_week', weekStartISO] as const,
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
// usePublishedWeekPlans
//
// Superficie del LÍDER (Mis actividades): planes publicados o en ejecución
// de la semana indicada, con sus items y el nombre del estándar, a través de
// TODOS los boards visibles para el usuario (RLS delimita la visibilidad —
// no hay asignación individual por líder; criterio: items del grupo para el
// plan publicado de la semana activa).
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishedWeekPlanItem extends WeeklyPlanItem {
  standard: { name: string; category: string; unit: string } | null;
}

export interface PublishedWeekPlan extends WeeklyPlan {
  group: { title: string; color: string | null } | null;
  board: { name: string } | null;
  items: PublishedWeekPlanItem[];
}

export function usePublishedWeekPlans(weekStartISO: string | undefined) {
  return useQuery<PublishedWeekPlan[]>({
    queryKey: weeklyPlanKeys.publishedWeek(weekStartISO!),
    queryFn: async () => {
      // Nota (ADR-0002): weekly_plan_items ya no tiene FK a board_activity_standards
      // (activity_standard_id → poa_activity_zone_id), así que PostgREST no puede
      // embeber `standard:board_activity_standards(...)` como antes. name/category
      // siguen viviendo en el Catálogo Técnico; se resuelven aparte por activity_key
      // (el campo que sigue siendo compartido entre catálogo técnico y POA) en vez
      // de por una relación de FK.
      const { data, error } = await supabase
        .from('weekly_plans')
        .select(`
          *,
          group:groups(title, color),
          board:boards(name),
          items:weekly_plan_items(*)
        `)
        .eq('week_start', weekStartISO!)
        .in('status', ['published', 'in_progress']);

      if (error) throw error;

      const plans = (data ?? []) as PublishedWeekPlan[];

      const boardIds = [...new Set(plans.map((p) => p.board_id))];
      const activityKeys = [...new Set(plans.flatMap((p) => p.items.map((i) => i.activity_key)))];
      let standardsByKey = new Map<string, { name: string; category: string; unit: string }>();
      if (boardIds.length > 0 && activityKeys.length > 0) {
        const { data: standards, error: stdError } = await supabase
          .from('board_activity_standards')
          .select('activity_key, name, category, unit')
          .in('board_id', boardIds)
          .in('activity_key', activityKeys)
          .is('effective_to', null);
        if (stdError) throw stdError;
        standardsByKey = new Map(
          (standards ?? []).map((s: { activity_key: string; name: string; category: string; unit: string }) => [s.activity_key, s]),
        );
      }

      for (const plan of plans) {
        plan.items.sort((a, b) => a.planned_sequence - b.planned_sequence);
        for (const item of plan.items) {
          item.standard = standardsByKey.get(item.activity_key) ?? null;
        }
      }
      return plans;
    },
    enabled: !!weekStartISO,
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
