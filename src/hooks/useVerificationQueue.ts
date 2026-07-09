'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { WeeklyPlanItemExecution } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// useVerificationQueue
//
// Superficie del SUPERVISOR (Verificación): bandeja de Jornadas en estado
// 'reported' de todos los boards visibles vía RLS — sin asignación individual
// por supervisor, mismo criterio que usePublishedWeekPlans para el líder.
//
// No usa embed de PostgREST hacia board_activity_standards (ya no tiene FK
// desde weekly_plan_items tras ADR-0002) — se resuelve name/category/unit
// por activity_key, aparte, igual que en usePublishedWeekPlans.
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationQueueItem extends WeeklyPlanItemExecution {
  activity_key: string;
  planned_unit: string;
  group_title: string;
  activity_name: string | null;
}

export function useVerificationQueue() {
  return useQuery<VerificationQueueItem[]>({
    queryKey: ['verification_queue'],
    queryFn: async (): Promise<VerificationQueueItem[]> => {
      const { data, error } = await supabase
        .from('weekly_plan_item_executions')
        .select(`
          *,
          plan_item:weekly_plan_items(
            activity_key, unit,
            plan:weekly_plans(group:groups(title))
          )
        `)
        .eq('status', 'reported')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as any[];
      const activityKeys = [...new Set(rows.map((r) => r.plan_item?.activity_key).filter(Boolean))];

      let namesByKey = new Map<string, string>();
      if (activityKeys.length > 0) {
        const { data: standards, error: stdError } = await supabase
          .from('board_activity_standards')
          .select('activity_key, name')
          .in('activity_key', activityKeys)
          .is('effective_to', null);
        if (stdError) throw stdError;
        namesByKey = new Map((standards ?? []).map((s: { activity_key: string; name: string }) => [s.activity_key, s.name]));
      }

      return rows.map((r) => ({
        ...r,
        activity_key: r.plan_item?.activity_key ?? '',
        planned_unit: r.plan_item?.unit ?? '',
        group_title: r.plan_item?.plan?.group?.title ?? 'Sitio',
        activity_name: namesByKey.get(r.plan_item?.activity_key) ?? null,
      }));
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
