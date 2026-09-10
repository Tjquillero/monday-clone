'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { WeeklyPlanningContext, SchedulerMigrationMissingError, MissingActivityStandard } from '@/types/scheduler';
import { getSiteCapacity } from '@/lib/siteCapacity';
import { buildWeeklyPlanningContext, calculateContractWeek, mergeStandardsForZone } from '@/lib/weeklyPlanner';
import { WORKING_DAYS_WEEK } from '@/lib/schedulerMath';
import { useContractStandards, useScopeMappings, useMissingBoardActivityStandards } from './useActivityStandards';
import { usePoaActiveCatalog, useActivePoaVersionId } from './usePoaActivities';
import { ensureWeeklyPlanMaterialized } from '@/lib/scheduleMaterializationService';

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlan
//
// Orquesta las fuentes de datos + el motor puro para producir un
// WeeklyPlanningContext completamente determinista y materializar las
// ocurrencias reales en PostgreSQL (`weekly_plan_items`).
// ─────────────────────────────────────────────────────────────────────────────

export interface UseWeeklyPlanResult {
  /** No vacío implica un plan PARCIAL — construido solo con las actividades que sí tienen catálogo técnico (ver missingStandards). */
  plan: WeeklyPlanningContext | null;
  /** Actividades contratadas sin catálogo técnico — informativo, nunca vacía el plan. El bloqueo real vive en confirm_weekly_plan(). */
  missingStandards: MissingActivityStandard[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useWeeklyPlan(
  boardId: string | undefined,
  group: { id: string; title: string } | undefined,
  weekStart: Date,
): UseWeeklyPlanResult {
  // Datos del contrato — cacheados por React Query, no se re-fetching por cada semana
  const {
    data: standards,
    isLoading: stdLoading,
    isError: stdError,
    error: stdErr,
  } = useContractStandards(boardId);

  // Fuente contractual (ADR-0002): frecuencia y precio de la versión activa del POA
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

  const { data: activePoaVersionId } = useActivePoaVersionId(boardId);

  const {
    data: missingStandards,
    isLoading: missingLoading,
    isError: missingError,
    error: missingErr,
  } = useMissingBoardActivityStandards(boardId, activePoaVersionId);

  // Cantidades por scope type — específico del sitio, no del contrato global
  const {
    data: analysisRow,
    isLoading: qtyLoading,
    isError: qtyError,
    error: qtyErr,
  } = useQuery({
    queryKey: ['resource_analysis_scope', boardId, group?.id],
    queryFn: async () => {
      if (!boardId || !group?.id) return null;

      const { data, error } = await supabase
        .from('resource_analysis')
        .select('scope_data')
        .eq('board_id', boardId)
        .eq('site_id', group.id)
        .maybeSingle();

      if (error?.code === '42P01') throw new SchedulerMigrationMissingError('resource_analysis');
      if (error) throw error;
      return data;
    },
    enabled: !!boardId && !!group?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Personal adscrito al sitio desde Módulo 2 (personnel_site_assignments)
  const { data: assignmentsCount } = useQuery({
    queryKey: ['personnel_site_assignments_count', group?.id],
    queryFn: async () => {
      if (!group?.id) return 0;
      const { count, error } = await supabase
        .from('personnel_site_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', group.id);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!group?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Gatillo Determinístico de Materialización e Inserción Idempotente SQL (weekly_plan_items)
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  useQuery({
    queryKey: ['materialize_weekly_plan', boardId, group?.id, weekStartStr],
    queryFn: async () => {
      if (!boardId || !group?.id) return null;
      return await ensureWeeklyPlanMaterialized(supabase, boardId, group.id, weekStart);
    },
    enabled: !!boardId && !!group?.id && !!standards && !!poaCatalog,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // El plan se deriva de los datos ya cacheados
  const plan = useMemo<WeeklyPlanningContext | null>(() => {
    if (!standards || !poaCatalog || !scopeMappings || analysisRow === undefined || !group) return null;
    if (missingStandards === undefined) return null;

    const mergedStandards = mergeStandardsForZone(standards, poaCatalog, group.id);
    const scopeQuantities: Record<string, number> = analysisRow?.scope_data ?? {};
    const dailyCapacity = assignmentsCount ?? 0;
    const zone = {
      id: group?.id ?? '',
      name: group?.title ?? '',
      daily_capacity: dailyCapacity,
    };

    const week = {
      start: weekStart,
      number: calculateContractWeek(weekStart),
      workingDays: WORKING_DAYS_WEEK,
    };

    return buildWeeklyPlanningContext(mergedStandards, scopeMappings, scopeQuantities, zone, week);
  }, [standards, poaCatalog, scopeMappings, analysisRow, group, weekStart, missingStandards, assignmentsCount]);

  const isLoading = stdLoading || poaLoading || mapLoading || qtyLoading || missingLoading;

  const error = (stdErr ?? poaErr ?? mapErr ?? qtyErr ?? missingErr) as Error | null;
  const isError = stdError || poaError || mapError || qtyError || missingError;

  return { plan, missingStandards: missingStandards ?? [], isLoading, isError, error };
}
