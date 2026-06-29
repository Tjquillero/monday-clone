'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  ActivityStandard,
  PerformanceObservation,
  ActivityStandardNotFound,
} from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// resolveActivityStandard
//
// Helper puro (no hook) que resuelve el estándar vigente para una actividad.
// Usa DOS queries separadas en lugar de OR para aprovechar los índices parciales:
//
//   Query 1 → idx_bas_active_site   (WHERE group_id = $x AND effective_to IS NULL)
//   Query 2 → idx_bas_active_contract (WHERE group_id IS NULL AND effective_to IS NULL)
//
// El resultado es el mismo que un LEFT JOIN con prioridad al sitio, pero sin
// el OR que impide usar los índices directamente.
//
// El caller no sabe que existen dos niveles de resolución.
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveActivityStandard(
  boardId: string,
  groupId: string | null,
  activityKey: string,
): Promise<ActivityStandard> {
  // Nivel 1: excepción del sitio (si aplica)
  if (groupId) {
    const { data, error } = await supabase
      .from('board_activity_standards')
      .select('*')
      .eq('board_id', boardId)
      .eq('group_id', groupId)
      .eq('activity_key', activityKey)
      .is('effective_to', null)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ActivityStandard;
  }

  // Nivel 2: estándar del contrato (fallback siempre)
  const { data, error } = await supabase
    .from('board_activity_standards')
    .select('*')
    .eq('board_id', boardId)
    .is('group_id', null)
    .eq('activity_key', activityKey)
    .is('effective_to', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as ActivityStandard;

  throw new ActivityStandardNotFound(boardId, groupId, activityKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// useActivityStandards
// Todos los estándares activos de un board (contrato + excepciones de sitio).
// Ordenados por activity_key para facilitar la comparación visual.
// ─────────────────────────────────────────────────────────────────────────────

export function useActivityStandards(boardId: string | undefined) {
  return useQuery({
    queryKey: ['activity_standards', boardId],
    queryFn: async (): Promise<ActivityStandard[]> => {
      if (!boardId) return [];

      const { data, error } = await supabase
        .from('board_activity_standards')
        .select('*')
        .eq('board_id', boardId)
        .is('effective_to', null)
        .order('activity_key')
        .order('group_id', { nullsFirst: true });

      if (error) throw error;
      return (data ?? []) as ActivityStandard[];
    },
    enabled: !!boardId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useContractStandards
// Solo los estándares a nivel de contrato (group_id IS NULL).
// Es lo que el ResourceEfficiencyWidget usa para calcular JR teórico
// sin distinción por sitio.
// ─────────────────────────────────────────────────────────────────────────────

export function useContractStandards(boardId: string | undefined) {
  return useQuery({
    queryKey: ['activity_standards', boardId, 'contract'],
    queryFn: async (): Promise<ActivityStandard[]> => {
      if (!boardId) return [];

      const { data, error } = await supabase
        .from('board_activity_standards')
        .select('*')
        .eq('board_id', boardId)
        .is('group_id', null)
        .is('effective_to', null)
        .order('activity_key');

      if (error) throw error;
      return (data ?? []) as ActivityStandard[];
    },
    enabled: !!boardId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// usePerformanceObservations
// Historial de rendimiento observado. Usado por el widget para mostrar
// la desviación respecto al estándar y por el scheduler para calibrar.
// ─────────────────────────────────────────────────────────────────────────────

export function usePerformanceObservations(
  boardId: string | undefined,
  activityKey?: string,
) {
  return useQuery({
    queryKey: ['activity_observations', boardId, activityKey ?? 'all'],
    queryFn: async (): Promise<PerformanceObservation[]> => {
      if (!boardId) return [];

      let q = supabase
        .from('activity_performance_observations')
        .select('*')
        .eq('board_id', boardId)
        .order('observation_date', { ascending: false });

      if (activityKey) {
        q = q.eq('activity_key', activityKey);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PerformanceObservation[];
    },
    enabled: !!boardId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
