'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB } from '@/lib/offlineDB';
import { isNetworkError } from './useBoardData';
import { WeeklyPlanItemExecution } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// useVerificationQueue
//
// Superficie del SUPERVISOR (Verificación): bandeja de Jornadas en estado
// 'reported' de todos los boards visibles vía RLS — sin asignación individual
// por supervisor, mismo criterio que usePublishedWeekPlans para el líder.
//
// No usa embed de PostgREST (ni hacia weekly_plan_items/weekly_plans/groups,
// ni hacia board_activity_standards): son queries planas + merge manual por
// id/activity_key. Dos razones, no solo una: (1) el mismo patrón ya evitó un
// bug real en usePublishedWeekPlans cuando ADR-0002 quitó una FK; (2) un
// embed con select parcial (title, name, etc.) no se puede cachear en
// IndexedDB sin arriesgar pisar con datos incompletos lo que ya cacheó
// useBoard/useBoardGroups en el mismo object store — las queries planas
// siempre traen la fila completa.
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationQueueItem extends WeeklyPlanItemExecution {
  activity_key: string;
  planned_unit: string;
  group_title: string;
  activity_name: string | null;
}

function buildQueueItems(
  executions: any[],
  itemsById: Map<string, any>,
  plansById: Map<string, any>,
  groupsById: Map<string, any>,
  namesByKey: Map<string, string>,
): VerificationQueueItem[] {
  return executions.map((r) => {
    const item = itemsById.get(r.plan_item_id);
    const plan = item ? plansById.get(item.plan_id) : undefined;
    const group = plan ? groupsById.get(plan.group_id) : undefined;
    const activityKey = item?.activity_key ?? '';
    return {
      ...r,
      activity_key: activityKey,
      planned_unit: item?.unit ?? '',
      group_title: group?.title ?? 'Sitio',
      activity_name: plan ? namesByKey.get(`${plan.board_id}|${activityKey}`) ?? null : null,
    };
  });
}

export function useVerificationQueue() {
  return useQuery<VerificationQueueItem[]>({
    queryKey: ['verification_queue'],
    queryFn: async (): Promise<VerificationQueueItem[]> => {
      try {
        const { data: execData, error } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .eq('status', 'reported')
          .order('created_at', { ascending: true });
        if (error) throw error;
        const executions = execData ?? [];

        const planItemIds = [...new Set(executions.map((r: any) => r.plan_item_id))];
        let items: any[] = [];
        if (planItemIds.length > 0) {
          const { data, error: itemsError } = await supabase
            .from('weekly_plan_items')
            .select('*')
            .in('id', planItemIds);
          if (itemsError) throw itemsError;
          items = data ?? [];
        }

        const planIds = [...new Set(items.map((i) => i.plan_id))];
        let plans: any[] = [];
        if (planIds.length > 0) {
          const { data, error: plansError } = await supabase
            .from('weekly_plans')
            .select('*')
            .in('id', planIds);
          if (plansError) throw plansError;
          plans = data ?? [];
        }

        const groupIds = [...new Set(plans.map((p) => p.group_id))];
        let groups: any[] = [];
        if (groupIds.length > 0) {
          const { data, error: groupsError } = await supabase
            .from('groups')
            .select('*')
            .in('id', groupIds);
          if (groupsError) throw groupsError;
          groups = data ?? [];
        }

        const boardIds = [...new Set(plans.map((p) => p.board_id))];
        const activityKeys = [...new Set(items.map((i) => i.activity_key))];
        let standards: any[] = [];
        if (boardIds.length > 0 && activityKeys.length > 0) {
          const { data, error: stdError } = await supabase
            .from('board_activity_standards')
            .select('*')
            .in('board_id', boardIds)
            .in('activity_key', activityKeys)
            .is('effective_to', null);
          if (stdError) throw stdError;
          standards = data ?? [];
        }

        // Caché de lectura offline (docs/architecture/offline-certification-design.md,
        // Incremento 1) — cada tabla se guarda con fila completa.
        if (offlineDB) {
          if (executions.length > 0) await offlineDB.upsertRecords('weekly_plan_item_executions', executions);
          if (items.length > 0) await offlineDB.upsertRecords('weekly_plan_items', items);
          if (plans.length > 0) await offlineDB.upsertRecords('weekly_plans', plans);
          if (groups.length > 0) await offlineDB.upsertRecords('groups', groups);
          if (standards.length > 0) await offlineDB.upsertRecords('board_activity_standards', standards);
        }

        const itemsById = new Map(items.map((i) => [i.id, i]));
        const plansById = new Map(plans.map((p) => [p.id, p]));
        const groupsById = new Map(groups.map((g) => [g.id, g]));
        const namesByKey = new Map(standards.map((s) => [`${s.board_id}|${s.activity_key}`, s.name]));

        return buildQueueItems(executions, itemsById, plansById, groupsById, namesByKey);
      } catch (err: any) {
        if (isNetworkError(err) && offlineDB) {
          console.log('[Offline] Verification queue query failed due to network. Falling back to IndexedDB.');

          const [localExecs, localItems, localPlans, localGroups, localStandards] = await Promise.all([
            offlineDB.getTable('weekly_plan_item_executions'),
            offlineDB.getTable('weekly_plan_items'),
            offlineDB.getTable('weekly_plans'),
            offlineDB.getTable('groups'),
            offlineDB.getTable('board_activity_standards'),
          ]);

          const itemsById = new Map<string, any>(localItems.map((i: any) => [i.id, i]));
          const plansById = new Map<string, any>(localPlans.map((p: any) => [p.id, p]));
          const groupsById = new Map<string, any>(localGroups.map((g: any) => [g.id, g]));
          const namesByKey = new Map<string, string>(
            localStandards
              .filter((s: any) => s.effective_to === null)
              .map((s: any) => [`${s.board_id}|${s.activity_key}`, s.name]),
          );

          const executions = localExecs
            .filter((e: any) => e.status === 'reported')
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          return buildQueueItems(executions, itemsById, plansById, groupsById, namesByKey);
        }
        throw err;
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
