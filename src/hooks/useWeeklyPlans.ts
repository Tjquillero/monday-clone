'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB } from '@/lib/offlineDB';
import { isNetworkError } from './useBoardData';
import { WeeklyPlan, WeeklyPlanItem, WeeklyPlanItemExecution, WeeklyPlanConfirmationSummary } from '@/types/scheduler';

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
  confirmationSummary: (planId: string)      => ['weekly_plan_confirmation_summary', planId] as const,
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
      // + board_id (dos boards pueden compartir el mismo activity_key) en vez de por
      // una relación de FK.
      try {
        const { data, error } = await supabase
          .from('weekly_plans')
          .select(`
            *,
            group:groups(*),
            board:boards(*),
            items:weekly_plan_items(*)
          `)
          .eq('week_start', weekStartISO!)
          .in('status', ['published', 'in_progress']);

        if (error) throw error;

        const plans = (data ?? []) as PublishedWeekPlan[];

        const boardIds = [...new Set(plans.map((p) => p.board_id))];
        const activityKeys = [...new Set(plans.flatMap((p) => p.items.map((i) => i.activity_key)))];
        let standards: any[] = [];
        let standardsByKey = new Map<string, { name: string; category: string; unit: string }>();
        if (boardIds.length > 0 && activityKeys.length > 0) {
          const { data: stdData, error: stdError } = await supabase
            .from('board_activity_standards')
            .select('*')
            .in('board_id', boardIds)
            .in('activity_key', activityKeys)
            .is('effective_to', null);
          if (stdError) throw stdError;
          standards = stdData ?? [];
          standardsByKey = new Map(standards.map((s: any) => [`${s.board_id}|${s.activity_key}`, s]));
        }

        for (const plan of plans) {
          plan.items.sort((a, b) => a.planned_sequence - b.planned_sequence);
          for (const item of plan.items) {
            item.standard = standardsByKey.get(`${plan.board_id}|${item.activity_key}`) ?? null;
          }
        }

        // Caché de lectura offline (docs/architecture/offline-certification-design.md,
        // Incremento 1). Grupo/board se guardan con fila completa (select *) para no
        // pisar con datos parciales lo que ya cacheó useBoard/useBoardGroups en el
        // mismo object store.
        if (offlineDB) {
          const plansOnly = plans.map(({ group, board, items, ...p }) => p);
          await offlineDB.upsertRecords('weekly_plans', plansOnly);
          const itemsOnly = plans.flatMap((p) => p.items.map(({ standard, ...i }) => i));
          if (itemsOnly.length > 0) await offlineDB.upsertRecords('weekly_plan_items', itemsOnly);
          const groupsOnly = plans.map((p) => p.group).filter(Boolean);
          if (groupsOnly.length > 0) await offlineDB.upsertRecords('groups', groupsOnly);
          const boardsOnly = plans.map((p) => p.board).filter(Boolean);
          if (boardsOnly.length > 0) await offlineDB.upsertRecords('boards', boardsOnly);
          if (standards.length > 0) await offlineDB.upsertRecords('board_activity_standards', standards);
        }

        return plans;
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Published week plans query failed due to network. Falling back to IndexedDB.');

          const [localPlans, localItems, localGroups, localBoards, localStandards] = await Promise.all([
            offlineDB.getTable('weekly_plans'),
            offlineDB.getTable('weekly_plan_items'),
            offlineDB.getTable('groups'),
            offlineDB.getTable('boards'),
            offlineDB.getTable('board_activity_standards'),
          ]);

          const groupsById = new Map<string, any>(localGroups.map((g: any) => [String(g.id), g]));
          const boardsById = new Map<string, any>(localBoards.map((b: any) => [String(b.id), b]));
          const standardsByKey = new Map<string, any>(
            localStandards
              .filter((s: any) => s.effective_to === null)
              .map((s: any) => [`${s.board_id}|${s.activity_key}`, s]),
          );

          const filteredPlans = localPlans.filter(
            (p: any) => p.week_start === weekStartISO && ['published', 'in_progress'].includes(p.status),
          );

          return filteredPlans.map((p: any) => {
            const items = localItems
              .filter((i: any) => String(i.plan_id) === String(p.id))
              .sort((a: any, b: any) => a.planned_sequence - b.planned_sequence)
              .map((i: any) => {
                const std = standardsByKey.get(`${p.board_id}|${i.activity_key}`);
                return {
                  ...i,
                  standard: std ? { name: std.name, category: std.category, unit: std.unit } : null,
                };
              });

            const g = groupsById.get(String(p.group_id));
            const b = boardsById.get(String(p.board_id));

            return {
              ...p,
              group: g ? { title: g.title, color: g.color } : null,
              board: b ? { name: b.name } : null,
              items,
            };
          }) as PublishedWeekPlan[];
        }
        throw err;
      }
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
      try {
        const { data, error } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .eq('plan_item_id', planItemId!)
          .order('execution_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) throw error;
        const executions = (data ?? []) as WeeklyPlanItemExecution[];
        if (offlineDB && executions.length > 0) {
          await offlineDB.upsertRecords('weekly_plan_item_executions', executions);
        }
        return executions;
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Weekly plan executions query failed due to network. Falling back to IndexedDB.');
          const local = await offlineDB.getTable('weekly_plan_item_executions');
          return local
            .filter((e: any) => String(e.plan_item_id) === String(planItemId))
            .sort((a: any, b: any) => {
              if (a.execution_date !== b.execution_date) return a.execution_date < b.execution_date ? -1 : 1;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }) as WeeklyPlanItemExecution[];
        }
        throw err;
      }
    },
    enabled: !!planItemId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanConfirmationSummary
//
// Superficie de Confirmación (Cronograma): consumidor puro de
// get_weekly_plan_confirmation_summary(plan_id). El conteo por estado y la
// resolución de activity_name viven en SQL (mismo criterio que el Gate 2 de
// confirm_weekly_plan) — este hook no hace joins ni agregaciones, solo pide
// la RPC y expone su única fila de respuesta.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlanConfirmationSummary(planId: string | undefined) {
  return useQuery<WeeklyPlanConfirmationSummary>({
    queryKey: weeklyPlanKeys.confirmationSummary(planId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_weekly_plan_confirmation_summary', {
        p_plan_id: planId!,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) throw new Error('No se pudo calcular el resumen de confirmación del plan.');
      return row as WeeklyPlanConfirmationSummary;
    },
    enabled: !!planId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}
