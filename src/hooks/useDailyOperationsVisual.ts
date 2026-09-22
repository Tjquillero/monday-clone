'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { DailyOperationalBrief, DailyActivityCard, evaluateDailyOperationalBrief } from '@/lib/dailyOperationalBriefService';
import { ExecutionRecord } from '@/types/execution';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { resolveActivityDescriptiveName } from '@/lib/activityCatalogResolver';

export interface SiteDailyGroup {
  groupId: string;
  groupTitle: string;
  activities: DailyActivityCard[];
}

export interface DailyOperationsVisualData {
  brief: DailyOperationalBrief;
  siteGroups: SiteDailyGroup[];
  availableDates: string[];
}

export interface UseDailyOperationsVisualOptions {
  boardId?: string;
  evaluatedDate?: string; // YYYY-MM-DD (por defecto hoy en Bogota)
  enabled?: boolean;
}

export const dailyOperationsKeys = {
  all: (boardId: string) => ['daily_operations_visual', boardId] as const,
  byDate: (boardId: string, date: string) => ['daily_operations_visual', boardId, date] as const,
};

function getBogotaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function useDailyOperationsVisual({
  boardId,
  evaluatedDate,
  enabled = true,
}: UseDailyOperationsVisualOptions) {
  const queryClient = useQueryClient();
  const dateStr = evaluatedDate || getBogotaDate();

  const query = useQuery<DailyOperationsVisualData | null>({
    queryKey: dailyOperationsKeys.byDate(boardId || '', dateStr),
    queryFn: async (): Promise<DailyOperationsVisualData | null> => {
      if (!boardId) return null;

      try {
        // 1. Obtener cabeceras de planes semanales para el tablero
        const { data: plansData, error: plansErr } = await supabase
          .from('weekly_plans')
          .select('*')
          .eq('board_id', boardId);

        if (plansErr) {
          console.warn('[useDailyOperationsVisual] Error fetching weekly_plans:', plansErr);
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
          console.warn('[useDailyOperationsVisual] Error fetching groups:', groupsErr);
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

        if (planIds.length === 0) {
          const emptyBrief = evaluateDailyOperationalBrief({
            evaluationDate: dateStr,
            boardId,
            crewId: '',
            weeklyPlanItems: [],
            executionRecords: [],
            attachments: [],
          });
          return { brief: emptyBrief, siteGroups: [], availableDates: [] };
        }

        // 4. Obtener los ítems planificados vinculados a los planes de este tablero
        const { data: rawItemsData, error: itemsErr } = await supabase
          .from('weekly_plan_items')
          .select('*')
          .in('plan_id', planIds);

        if (itemsErr) {
          console.warn('[useDailyOperationsVisual] Error fetching weekly_plan_items:', itemsErr);
        }

        const items: WeeklyPlanItem[] = (rawItemsData || []).map((row: any) => {
          const parentPlan = plansMap.get(row.plan_id);
          const groupTitle = parentPlan?.group_id ? groupsMap.get(parentPlan.group_id) : '';
          const rawKey = row.activity_key || row.routine_reference || row.code;
          let descriptiveName = resolveActivityDescriptiveName(rawKey, standardsMap);

          if (!descriptiveName || descriptiveName === rawKey || /^[0-9.]+$/.test(descriptiveName)) {
            descriptiveName = resolveActivityDescriptiveName(rawKey);
          }

          console.debug('[H1-DEBUG-HOOK]', {
            sourceRow: row,
            activity_key: row.activity_key,
            routine_reference: row.routine_reference,
            code: row.code,
            rawKey,
            descriptiveName
          });

          return {
            id: row.id,
            weekly_plan_id: row.plan_id,
            board_id: parentPlan?.board_id || boardId,
            group_id: parentPlan?.group_id || null,
            activity_key: rawKey,
            name: descriptiveName,
            zone: groupTitle || '',
            unit: row.unit || 'und',
            planned_date: row.planned_date || parentPlan?.week_start || dateStr,
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

        const itemIds = items.map((i) => i.id);
        const itemToGroupMap = new Map<string, string>();
        items.forEach((it) => {
          if (it.group_id) itemToGroupMap.set(it.id, it.group_id);
        });

        if (itemIds.length === 0) {
          const emptyBrief = evaluateDailyOperationalBrief({
            evaluationDate: dateStr,
            boardId,
            crewId: '',
            weeklyPlanItems: [],
            executionRecords: [],
            attachments: [],
          });
          return { brief: emptyBrief, siteGroups: [], availableDates: [] };
        }

        // 5. Obtener ejecuciones de estos ítems usando la columna física 'plan_item_id'
        let executions: ExecutionRecord[] = [];
        if (itemIds.length > 0) {
          const { data: execsData, error: execsErr } = await supabase
            .from('weekly_plan_item_executions')
            .select('*')
            .in('plan_item_id', itemIds);

          if (execsErr) {
            console.warn('[useDailyOperationsVisual] Error fetching executions:', execsErr);
          }

          executions = (execsData || []).map((row: any) => ({
            ...row,
            weekly_plan_item_id: row.plan_item_id || row.weekly_plan_item_id,
            verification_status: row.status || row.verification_status || 'reported',
          }));
        }

        const execIds = executions.map((e) => e.id);

        // 6. Obtener adjuntos fotográficos de estas ejecuciones
        let attachments: any[] = [];
        if (execIds.length > 0) {
          const { data: attData, error: attErr } = await supabase
            .from('execution_attachments')
            .select('*')
            .in('execution_id', execIds);

          if (attErr) {
            console.warn('[useDailyOperationsVisual] Error fetching attachments:', attErr);
          }
          attachments = attData || [];
        }

        // Obtener fechas con programación activa en el tablero
        const availableDates = Array.from(
          new Set(items.map((i) => i.planned_date).filter(Boolean) as string[])
        ).sort();

        // Filtrar ítems relevantes para la fecha evaluada (programados para dateStr o con ejecuciones registradas en dateStr)
        const dayItems = items.filter((it) => {
          const hasDateExec = executions.some(
            (e) => e.weekly_plan_item_id === it.id && e.execution_date === dateStr
          );
          return it.planned_date === dateStr || hasDateExec;
        });

        // 7. Evaluar Read Model determinístico con los ítems de la jornada
        const brief = evaluateDailyOperationalBrief({
          evaluationDate: dateStr,
          boardId,
          crewId: '',
          weeklyPlanItems: dayItems,
          executionRecords: executions,
          attachments,
        });

        // 8. Agrupar actividades del Brief por Sitio / Frente de Trabajo
        const activityMapByGroup = new Map<string, DailyActivityCard[]>();

        brief.activities.forEach((card) => {
          const gId = itemToGroupMap.get(card.weeklyPlanItemId) || 'unassigned';
          if (!activityMapByGroup.has(gId)) {
            activityMapByGroup.set(gId, []);
          }
          activityMapByGroup.get(gId)!.push(card);
        });

        const siteGroups: SiteDailyGroup[] = [];

        // Agregar grupos existentes preservando orden
        groups.forEach((g) => {
          const acts = activityMapByGroup.get(g.id) || [];
          if (acts.length > 0) {
            siteGroups.push({
              groupId: g.id,
              groupTitle: g.title,
              activities: acts,
            });
          }
        });

        // Agregar grupos no asignados o huérfanos
        activityMapByGroup.forEach((acts, gId) => {
          if (!groupsMap.has(gId) && acts.length > 0) {
            siteGroups.push({
              groupId: gId,
              groupTitle: gId === 'unassigned' ? 'Actividades Generales' : `Sitio (${gId})`,
              activities: acts,
            });
          }
        });

        return {
          brief,
          siteGroups,
          availableDates,
        };
      } catch (err) {
        console.error('[useDailyOperationsVisual] Caught error in queryFn:', err);
        const emptyBrief = evaluateDailyOperationalBrief({
          evaluationDate: dateStr,
          boardId,
          crewId: '',
          weeklyPlanItems: [],
          executionRecords: [],
          attachments: [],
        });
        return { brief: emptyBrief, siteGroups: [], availableDates: [] };
      }
    },
    enabled: !!boardId && enabled,
    staleTime: 10_000,
  });

  // Suscripción Realtime Acotada (postgres_changes -> query invalidation ONLY)
  useEffect(() => {
    if (!boardId || !enabled) return;

    const channelName = 'realtime_daily_ops_' + boardId + '_' + dateStr;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'weekly_plan_item_executions' },
        () => {
          queryClient.invalidateQueries({
            queryKey: dailyOperationsKeys.byDate(boardId, dateStr),
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'weekly_plan_item_executions' },
        () => {
          queryClient.invalidateQueries({
            queryKey: dailyOperationsKeys.byDate(boardId, dateStr),
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'execution_attachments' },
        () => {
          queryClient.invalidateQueries({
            queryKey: dailyOperationsKeys.byDate(boardId, dateStr),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, dateStr, enabled, queryClient]);

  return {
    ...query,
    evaluatedDate: dateStr,
  };
}
