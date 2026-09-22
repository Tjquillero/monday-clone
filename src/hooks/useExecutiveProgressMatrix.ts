'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  evaluateSupervisorExecutiveDashboardView,
  SupervisorExecutiveDashboardViewData,
  ExecutiveOccurrenceAnalysis,
} from '@/lib/supervisorExecutiveDashboardService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Crew } from '@/types/crew';
import { resolveActivityDescriptiveName } from '@/lib/activityCatalogResolver';

export interface SiteItemData extends ExecutiveOccurrenceAnalysis {
  unit: string;
  zone?: string;
}

export interface SiteProgressData {
  siteId: string;
  siteTitle: string;
  totalActivitiesCount: number;
  completedActivitiesCount: number;
  verifiedProgressPct: number;
  reportedProgressPct: number;
  items: SiteItemData[];
}

export interface ExecutiveProgressMatrixData {
  dashboard: SupervisorExecutiveDashboardViewData;
  sites: SiteProgressData[];
  overallCompletedActivities: number;
  overallTotalActivities: number;
}

export interface UseExecutiveProgressMatrixOptions {
  boardId?: string;
  enabled?: boolean;
}

export const executiveProgressKeys = {
  all: (boardId: string) => ['executive_progress_matrix', boardId] as const,
};

function getBogotaIsoString(): string {
  return new Date().toISOString();
}

export function useExecutiveProgressMatrix({
  boardId,
  enabled = true,
}: UseExecutiveProgressMatrixOptions) {
  const queryClient = useQueryClient();

  const query = useQuery<ExecutiveProgressMatrixData | null>({
    queryKey: executiveProgressKeys.all(boardId || ''),
    queryFn: async (): Promise<ExecutiveProgressMatrixData | null> => {
      if (!boardId) return null;

      try {
        // 1. Obtener cabeceras de planes semanales para el tablero
        const { data: plansData, error: plansErr } = await supabase
          .from('weekly_plans')
          .select('*')
          .eq('board_id', boardId);

        if (plansErr) {
          console.warn('[useExecutiveProgressMatrix] Error fetching weekly_plans:', plansErr);
        }

        const plans = (plansData || []) as Array<{ id: string; board_id: string; group_id: string | null; week_start?: string; status?: string }>;
        const planIds = plans.map((p) => p.id);
        const plansMap = new Map<string, any>(plans.map((p) => [p.id, p]));

        // 2. Obtener grupos (sitios / frentes de trabajo) del tablero
        const { data: groupsData, error: groupsErr } = await supabase
          .from('groups')
          .select('id, title, position')
          .eq('board_id', boardId)
          .order('position', { ascending: true });

        if (groupsErr) {
          console.warn('[useExecutiveProgressMatrix] Error fetching groups:', groupsErr);
        }

        const groups = (groupsData || []) as Array<{ id: string; title: string; position: number }>;
        const groupsMap = new Map<string, string>();
        groups.forEach((g) => groupsMap.set(g.id, g.title));

        // 3. Obtener catálogo de estándares / nombres de actividad del tablero
        const { data: standardsData } = await supabase
          .from('board_activity_standards')
          .select('activity_key, name')
          .eq('board_id', boardId)
          .is('effective_to', null);

        const standardsMap = new Map<string, string>();
        (standardsData || []).forEach((s: any) => {
          if (s.activity_key && s.name) {
            standardsMap.set(s.activity_key, s.name);
          }
        });

        let weeklyPlanItems: WeeklyPlanItem[] = [];

        if (planIds.length > 0) {
          // 4. Obtener ítems planificados vinculados a los planes
          const { data: rawItemsData, error: itemsErr } = await supabase
            .from('weekly_plan_items')
            .select('*')
            .in('plan_id', planIds);

          if (itemsErr) {
            console.warn('[useExecutiveProgressMatrix] Error fetching weekly_plan_items:', itemsErr);
          }

          weeklyPlanItems = (rawItemsData || []).map((row: any) => {
            const parentPlan = plansMap.get(row.plan_id);
            const groupTitle = parentPlan?.group_id ? groupsMap.get(parentPlan.group_id) : '';
            const descriptiveName = resolveActivityDescriptiveName(row.activity_key, standardsMap);

            return {
              id: row.id,
              weekly_plan_id: row.plan_id,
              board_id: parentPlan?.board_id || boardId,
              group_id: parentPlan?.group_id || null,
              activity_key: row.activity_key,
              name: descriptiveName,
              zone: groupTitle || '',
              unit: row.unit || 'und',
              planned_date: row.planned_date || parentPlan?.week_start || new Date().toISOString().split('T')[0],
              planned_qty: Number(row.planned_qty || 0),
              theoretical_jr: Number(row.planned_jr || 0),
              source_type: 'ROUTINE',
              routine_reference: row.activity_key,
              occurrence_key: row.occurrence_key || row.id,
              is_manual_override: !!row.is_manual_override,
              status: row.status || 'planned',
              created_at: row.created_at,
              updated_at: row.updated_at,
            };
          });
        }

        const itemIds = weeklyPlanItems.map((i) => i.id);
        const itemsMap = new Map<string, WeeklyPlanItem>();
        weeklyPlanItems.forEach((item) => itemsMap.set(item.id, item));

        // 5. Obtener ejecuciones usando la columna física 'plan_item_id'
        let executionRecords: ExecutionRecord[] = [];
        if (itemIds.length > 0) {
          const { data: execsData, error: execsErr } = await supabase
            .from('weekly_plan_item_executions')
            .select('*')
            .in('plan_item_id', itemIds);

          if (execsErr) {
            console.warn('[useExecutiveProgressMatrix] Error fetching executions:', execsErr);
          }
          
          executionRecords = (execsData || []).map((row: any) => ({
            ...row,
            weekly_plan_item_id: row.plan_item_id || row.weekly_plan_item_id,
            verification_status: row.status || row.verification_status || 'reported',
          }));
        }

        // 6. Obtener cuadrillas del tablero
        const { data: crewsData, error: crewsErr } = await supabase
          .from('crews')
          .select('*')
          .eq('board_id', boardId);

        if (crewsErr) {
          console.warn('[useExecutiveProgressMatrix] Error fetching crews:', crewsErr);
        }

        const crews = (crewsData || []) as Crew[];

        // 7. Evaluar Read Model determinístico
        const dashboard = evaluateSupervisorExecutiveDashboardView(
          boardId,
          weeklyPlanItems,
          executionRecords,
          [], // prices
          [], // actas
          [], // actaItems
          [], // actaItemSources
          crews,
          [], // crewWorkloads
          {
            userId: 'read-model-viewer',
            boardId,
            userRoles: [{ board_id: boardId, role: 'supervisor' }],
          },
          getBogotaIsoString()
        );

        // 8. Estructurar Desglose Jerárquico: Consolidado -> Sitio -> Actividad
        const siteMap = new Map<string, SiteItemData[]>();

        dashboard.occurrences.forEach((occ) => {
          const parentItem = itemsMap.get(occ.planItemId);
          const groupId = parentItem?.group_id || 'unassigned';
          const enrichedItem: SiteItemData = {
            ...occ,
            unit: parentItem?.unit || '',
            zone: parentItem?.zone,
          };

          if (!siteMap.has(groupId)) {
            siteMap.set(groupId, []);
          }
          siteMap.get(groupId)!.push(enrichedItem);
        });

        const sites: SiteProgressData[] = [];
        let overallCompleted = 0;
        let overallTotal = 0;

        // Iterar preservando los grupos registrados en la base de datos
        if (groups.length > 0) {
          groups.forEach((g) => {
            const items = siteMap.get(g.id) || [];
            if (items.length > 0) {
              let siteVerifiedSum = 0;
              let siteReportedSum = 0;
              let siteCompleted = 0;

              items.forEach((it) => {
                const vPct = it.plannedQty > 0 ? Math.min(100, (it.executedQtyVerified / it.plannedQty) * 100) : 0;
                const rPct = it.plannedQty > 0 ? (it.executedQtyReported / it.plannedQty) * 100 : 0;
                siteVerifiedSum += vPct;
                siteReportedSum += rPct;
                if (it.executedQtyVerified >= it.plannedQty && it.plannedQty > 0) {
                  siteCompleted += 1;
                }
              });

              overallCompleted += siteCompleted;
              overallTotal += items.length;

              sites.push({
                siteId: g.id,
                siteTitle: g.title,
                totalActivitiesCount: items.length,
                completedActivitiesCount: siteCompleted,
                verifiedProgressPct: items.length > 0 ? siteVerifiedSum / items.length : 0,
                reportedProgressPct: items.length > 0 ? siteReportedSum / items.length : 0,
                items,
              });
            }
          });
        }

        // Procesar grupos adicionales o no asignados
        siteMap.forEach((items, groupId) => {
          if (!groupsMap.has(groupId) && items.length > 0) {
            let siteVerifiedSum = 0;
            let siteReportedSum = 0;
            let siteCompleted = 0;

            items.forEach((it) => {
              const vPct = it.plannedQty > 0 ? Math.min(100, (it.executedQtyVerified / it.plannedQty) * 100) : 0;
              const rPct = it.plannedQty > 0 ? (it.executedQtyReported / it.plannedQty) * 100 : 0;
              siteVerifiedSum += vPct;
              siteReportedSum += rPct;
              if (it.executedQtyVerified >= it.plannedQty && it.plannedQty > 0) {
                siteCompleted += 1;
              }
            });

            overallCompleted += siteCompleted;
            overallTotal += items.length;

            sites.push({
              siteId: groupId,
              siteTitle: groupId === 'unassigned' ? 'Actividades Generales' : `Sitio (${groupId})`,
              totalActivitiesCount: items.length,
              completedActivitiesCount: siteCompleted,
              verifiedProgressPct: items.length > 0 ? siteVerifiedSum / items.length : 0,
              reportedProgressPct: items.length > 0 ? siteReportedSum / items.length : 0,
              items,
            });
          }
        });

        return {
          dashboard,
          sites,
          overallCompletedActivities: overallCompleted,
          overallTotalActivities: overallTotal || dashboard.occurrences.length,
        };
      } catch (err) {
        console.error('[useExecutiveProgressMatrix] Caught error in queryFn:', err);
        const fallbackDashboard = evaluateSupervisorExecutiveDashboardView(
          boardId,
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          {
            userId: 'read-model-viewer',
            boardId,
            userRoles: [{ board_id: boardId, role: 'supervisor' }],
          },
          getBogotaIsoString()
        );
        return {
          dashboard: fallbackDashboard,
          sites: [],
          overallCompletedActivities: 0,
          overallTotalActivities: 0,
        };
      }
    },
    enabled: !!boardId && enabled,
    staleTime: 15_000,
  });

  // Suscripción Realtime Acotada para invalidar el dashboard gerencial
  useEffect(() => {
    if (!boardId || !enabled) return;

    const channelName = 'realtime_exec_progress_' + boardId;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'weekly_plan_item_executions' },
        () => {
          queryClient.invalidateQueries({
            queryKey: executiveProgressKeys.all(boardId),
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'weekly_plan_item_executions' },
        () => {
          queryClient.invalidateQueries({
            queryKey: executiveProgressKeys.all(boardId),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, enabled, queryClient]);

  return query;
}
