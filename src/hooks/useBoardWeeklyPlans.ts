'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { SchedulerMigrationMissingError } from '@/types/scheduler';
import { buildBoardPlanningContexts, calculateContractWeek, BoardSitePlan } from '@/lib/weeklyPlanner';
import { WORKING_DAYS_WEEK } from '@/lib/schedulerMath';
import { useContractStandards, useScopeMappings } from './useActivityStandards';
import { usePoaActiveCatalog } from './usePoaActivities';

// ─────────────────────────────────────────────────────────────────────────────
// useBoardWeeklyPlans
//
// Fan-out de useWeeklyPlan a TODAS las zonas de un board — base de datos de
// los indicadores ejecutivos (ranking de sitios, Pareto de JR). Reutiliza
// exactamente las mismas fuentes board-level que useWeeklyPlan (cacheadas
// por React Query, una sola vez, sin importar cuántos sitios haya) y agrega
// UNA sola query batched a resource_analysis para todas las zonas, en vez de
// una por sitio. El hook solo orquesta — toda la lógica de negocio vive en
// buildBoardPlanningContexts() (weeklyPlanner.ts), pura y testeable aparte.
// ─────────────────────────────────────────────────────────────────────────────

export interface UseBoardWeeklyPlansResult {
  sites: BoardSitePlan[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useBoardWeeklyPlans(
  boardId: string | undefined,
  groups: { id: string; title: string }[] | undefined,
  weekStart: Date,
): UseBoardWeeklyPlansResult {
  const {
    data: standards,
    isLoading: stdLoading,
    isError: stdError,
    error: stdErr,
  } = useContractStandards(boardId);

  const {
    data: poaCatalog,
    isLoading: poaLoading,
    isError: poaError,
    error: poaErr,
  } = usePoaActiveCatalog(boardId);

  const {
    data: scopeMappings,
    isLoading: mapLoading,
    isError: mapError,
    error: mapErr,
  } = useScopeMappings();

  const {
    data: scopeDataBySite,
    isLoading: qtyLoading,
    isError: qtyError,
    error: qtyErr,
  } = useQuery({
    queryKey: ['resource_analysis_scope_board', boardId],
    queryFn: async () => {
      if (!boardId) return {};

      const { data, error } = await supabase
        .from('resource_analysis')
        .select('site_id, scope_data')
        .eq('board_id', boardId);

      if (error?.code === '42P01') throw new SchedulerMigrationMissingError('resource_analysis');
      if (error) throw error;

      const bySite: Record<string, Record<string, number>> = {};
      for (const row of data ?? []) {
        bySite[row.site_id] = (row.scope_data as Record<string, number>) ?? {};
      }
      return bySite;
    },
    enabled: !!boardId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sites = useMemo<BoardSitePlan[]>(() => {
    if (!standards || !poaCatalog || !scopeMappings || !scopeDataBySite || !groups) return [];

    const week = { start: weekStart, number: calculateContractWeek(weekStart), workingDays: WORKING_DAYS_WEEK };
    return buildBoardPlanningContexts(groups, standards, poaCatalog, scopeMappings, scopeDataBySite, week);
  }, [standards, poaCatalog, scopeMappings, scopeDataBySite, groups, weekStart]);

  return {
    sites,
    isLoading: stdLoading || poaLoading || mapLoading || qtyLoading,
    isError: stdError || poaError || mapError || qtyError,
    error: (stdErr ?? poaErr ?? mapErr ?? qtyErr) as Error | null,
  };
}
