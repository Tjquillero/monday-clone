'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { WeeklyPlanningContext, SchedulerMigrationMissingError, ActivityStandardWithFrecuencia, MissingActivityStandard } from '@/types/scheduler';
import { getSiteCapacity } from '@/lib/siteCapacity';
import { buildWeeklyPlanningContext, calculateContractWeek } from '@/lib/weeklyPlanner';
import { WORKING_DAYS_WEEK } from '@/lib/schedulerMath';
import { useContractStandards, useScopeMappings, useMissingBoardActivityStandards } from './useActivityStandards';
import { usePoaActiveCatalog, useActivePoaVersionId } from './usePoaActivities';

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlan
//
// Orquesta cinco fuentes de datos + el motor puro para producir un
// WeeklyPlanningContext completamente determinista:
//
//   useContractStandards(boardId)              → catálogo técnico (rendimiento, priority)
//   usePoaActiveCatalog(boardId)                → frecuencia/precio de la versión POA activa
//   useScopeMappings()                          → activity_key → scope_key
//   resource_analysis (scope_data)              → cantidades por scope type del sitio
//   getSiteCapacity(group.title)                 → capacidad diaria del sitio (v1: hardcoded)
//   useMissingBoardActivityStandards(board, poa) → actividades contratadas sin catálogo técnico
//        │
//        ▼
//   merge (por activity_key + zona) → buildWeeklyPlanningContext() → WeeklyPlanningContext
//
// El merge descarta actividades del catálogo técnico que no tengan cobertura
// vigente en el POA para esta zona (Regla 13, poa-domain.md: origen exclusivo
// de actividades) — no se planifica algo que no está en el contrato activo.
//
// Separación de fases (2026-07-18, ver
// docs/architecture/poa-technical-catalog-decoupling.md): si existe al
// menos una actividad contratada sin catálogo técnico todavía
// (missingStandards), el hook NO construye ningún plan — ni siquiera parcial
// con las que sí tienen catálogo. Un plan "casi completo" que omite trabajo
// real en silencio es más peligroso que un bloqueo explícito: el consumidor
// debe mostrar exactamente qué falta, nunca generar semanas incompletas sin
// avisar.
//
// El hook no conoce nada de componentes visuales.
// El resultado es idempotente: la misma (boardId, group, weekStart) siempre
// produce el mismo plan.
//
// TODO v2: reemplazar getSiteCapacity() por query a group_capacities table.
// ─────────────────────────────────────────────────────────────────────────────

export interface UseWeeklyPlanResult {
  plan: WeeklyPlanningContext | null;
  /** Actividades contratadas sin catálogo técnico — no vacío implica plan === null (bloqueo explícito, no un plan parcial). */
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

  // Separación de fases: id de la versión activa del POA — necesario para
  // comparar contra get_missing_board_activity_standards(), que compara por
  // versión específica, no por "el board" en general.
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

  // El plan se deriva de los datos ya cacheados — no necesita su propio useQuery
  const plan = useMemo<WeeklyPlanningContext | null>(() => {
    if (!standards || !poaCatalog || !scopeMappings || analysisRow === undefined || !group) return null;
    // Bloqueo explícito, no plan parcial (ver comentario de cabecera): con
    // actividades contratadas sin catálogo técnico, no se construye ningún
    // WeeklyPlanningContext — el consumidor debe mostrar missingStandards.
    if (missingStandards === undefined || missingStandards.length > 0) return null;

    // Merge Catálogo Técnico + Actividad del POA (frecuencia/precio) por
    // activity_key, filtrando por cobertura vigente en esta zona.
    const mergedStandards: ActivityStandardWithFrecuencia[] = [];
    for (const s of standards) {
      const poaActivity = poaCatalog.get(s.activity_key);
      const zoneCoverage = poaActivity?.zones.get(group.id);
      if (!poaActivity || !zoneCoverage) continue; // sin cobertura POA vigente: no se planifica
      mergedStandards.push({
        ...s,
        frecuencia: poaActivity.frecuencia,
        poa_activity_zone_id: zoneCoverage.poaActivityZoneId,
      });
    }

    const scopeQuantities: Record<string, number> = analysisRow?.scope_data ?? {};

    // Capacidad del sitio — desde SITE_CAPACITY hardcodeado (v1)
    // Si el nombre del grupo no coincide, usa fallback de 0 (plan marcado infactible)
    const siteCapacity = group ? getSiteCapacity(group.title) : null;
    const zone = {
      id: group?.id ?? '',
      name: group?.title ?? '',
      daily_capacity: siteCapacity?.daily_capacity ?? 0,
    };

    const week = {
      start: weekStart,
      number: calculateContractWeek(weekStart),
      workingDays: WORKING_DAYS_WEEK,
    };

    return buildWeeklyPlanningContext(mergedStandards, scopeMappings, scopeQuantities, zone, week);
  }, [standards, poaCatalog, scopeMappings, analysisRow, group, weekStart, missingStandards]);

  const isLoading = stdLoading || poaLoading || mapLoading || qtyLoading || missingLoading;

  // Errores — preservar la instancia para que el consumidor pueda usar instanceof
  const error = (stdErr ?? poaErr ?? mapErr ?? qtyErr ?? missingErr) as Error | null;
  const isError = stdError || poaError || mapError || qtyError || missingError;

  return { plan, missingStandards: missingStandards ?? [], isLoading, isError, error };
}
