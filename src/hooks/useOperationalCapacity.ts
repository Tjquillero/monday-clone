'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useOperationalStandards, useOperationalScopeMappings } from './useOperationalStandards';
import { getCrewsForBoard, getActivePersonnelVersion, getPersonnelSiteAssignments } from '@/lib/crewService';
import {
  calculateOperationalGap,
  calculateCrewWorkloads,
  OperationalGapSummary,
  DailyCrewWorkload,
} from '@/lib/operationalCapacityService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';

/**
 * Hook para consumir la Capacidad Operativa, Carga de Cuadrillas y Brecha de Personal (Módulo 3)
 *
 * Lógica pura de lectura determinística.
 * Unifica Resource Analysis (Necesidad X), Módulo 2 (Personal Asignado Y) y Carga de Cuadrillas (Micro).
 */
export function useOperationalCapacity({
  boardId,
  siteId,
  siteName,
  weeklyPlanItems = [],
}: {
  boardId: string | undefined;
  siteId: string | undefined;
  siteName?: string;
  weeklyPlanItems?: WeeklyPlanItem[];
}) {
  // 1. Obtener datos de Resource Analysis para el sitio
  const { data: resourceAnalysisRow, isLoading: isLoadingResourceAnalysis } = useQuery({
    queryKey: ['resource_analysis_row', boardId, siteId],
    queryFn: async () => {
      if (!boardId || !siteId) return null;
      const { data, error } = await supabase
        .from('resource_analysis')
        .select('*')
        .eq('board_id', boardId)
        .eq('site_id', siteId)
        .maybeSingle();

      if (error) {
        console.warn('[useOperationalCapacity] Error querying resource_analysis:', error.message);
        return null;
      }
      return data;
    },
    enabled: !!boardId && !!siteId,
    staleTime: 60_000,
  });

  // 2. Estándares y Scope Mappings del Catálogo Técnico
  const effectiveSiteName = siteName || 'Plaza Puerto Colombia';
  const { data: standards = [], isLoading: isLoadingStandards } = useOperationalStandards(effectiveSiteName);
  const { data: scopeMappings = [], isLoading: isLoadingMappings } = useOperationalScopeMappings(effectiveSiteName);

  // 3. Adscripciones activas de personal del Módulo 2
  const { data: siteAssignments = [], isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['site_assignments_active', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const version = await getActivePersonnelVersion(boardId);
      if (!version) return [];
      return await getPersonnelSiteAssignments(version.id);
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });

  // 4. Cuadrillas del sitio/board
  const { data: crews = [], isLoading: isLoadingCrews } = useQuery({
    queryKey: ['board_crews_active', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      return await getCrewsForBoard(boardId);
    },
    enabled: !!boardId,
    staleTime: 30_000,
  });

  // 5. Cálculo Determinístico Macro: Brecha Operativa (X vs Y)
  const operationalGap = useMemo<OperationalGapSummary | null>(() => {
    if (!siteId) return null;
    const scopeData = resourceAnalysisRow?.scope_data ?? {};

    return calculateOperationalGap(
      siteId,
      effectiveSiteName,
      scopeData,
      standards,
      scopeMappings,
      siteAssignments
    );
  }, [siteId, effectiveSiteName, resourceAnalysisRow, standards, scopeMappings, siteAssignments]);

  // 6. Cálculo Determinístico Micro: Carga de Planificación por Cuadrilla
  const crewWorkloads = useMemo<DailyCrewWorkload[]>(() => {
    if (!weeklyPlanItems || weeklyPlanItems.length === 0) return [];
    return calculateCrewWorkloads(weeklyPlanItems, crews);
  }, [weeklyPlanItems, crews]);

  const isLoading =
    isLoadingResourceAnalysis ||
    isLoadingStandards ||
    isLoadingMappings ||
    isLoadingAssignments ||
    isLoadingCrews;

  return {
    operationalGap,
    crewWorkloads,
    crews,
    siteAssignments,
    isLoading,
  };
}
