'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import {
  calculateSiteResourceConsumption,
  MinimalExecutionRecord,
  SiteResourceConsumptionSummary,
} from '@/lib/resourceConsumptionControlService';

/**
 * Hook para consultar el Control de Consumo Operativo Físico de Recursos en Campo.
 * Lógica pura de lectura determinística (0 mutaciones BD).
 */
export function useResourceConsumptionControl({
  boardId,
  weeklyPlanId,
  weeklyPlanItems = [],
}: {
  boardId: string | undefined;
  weeklyPlanId?: string | undefined;
  weeklyPlanItems?: WeeklyPlanItem[];
}) {
  // 1. Obtener registros de ejecución de campo para el plan semanal / board
  const { data: executions = [], isLoading: isLoadingExecutions } = useQuery({
    queryKey: ['resource_consumption_executions', boardId, weeklyPlanId],
    queryFn: async () => {
      if (!boardId) return [];
      let query = supabase
        .from('execution_records')
        .select('id, weekly_plan_item_id, occurrence_key, executed_qty, executed_jr, verification_status, status, execution_date, crew_id, machinery_id')
        .eq('board_id', boardId);

      if (weeklyPlanId) {
        query = query.eq('weekly_plan_id', weeklyPlanId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[useResourceConsumptionControl] Error fetching executions:', error.message);
        return [];
      }
      return (data as MinimalExecutionRecord[]) ?? [];
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });

  // 2. Cálculo determinístico de consumo físico
  const consumptionSummary = useMemo<SiteResourceConsumptionSummary | null>(() => {
    if (!weeklyPlanItems || weeklyPlanItems.length === 0) return null;
    return calculateSiteResourceConsumption(weeklyPlanItems, executions);
  }, [weeklyPlanItems, executions]);

  return {
    consumptionSummary,
    executions,
    isLoading: isLoadingExecutions,
  };
}
