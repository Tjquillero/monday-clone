'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  ActivityStandard,
  ActivityCategory,
  ActivityPriority,
  ScopeMapping,
  PerformanceObservation,
  ActivityStandardNotFound,
  SchedulerMigrationMissingError,
  MissingActivityStandard,
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

      if (error?.code === '42P01') throw new SchedulerMigrationMissingError('board_activity_standards');
      if (error) throw error;
      return (data ?? []) as ActivityStandard[];
    },
    enabled: !!boardId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useScopeMappings
// Catálogo global activity_key → scope_key. No depende del board.
// Raramente cambia: staleTime 10 min.
// ─────────────────────────────────────────────────────────────────────────────

export function useScopeMappings() {
  return useQuery({
    queryKey: ['activity_scope_mappings'],
    queryFn: async (): Promise<ScopeMapping[]> => {
      const { data, error } = await supabase
        .from('activity_scope_mappings')
        .select('activity_key, scope_key, weight');

      if (error?.code === '42P01') throw new SchedulerMigrationMissingError('activity_scope_mappings');
      if (error) throw error;
      return (data ?? []) as ScopeMapping[];
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useMissingBoardActivityStandards
//
// Actividades contratadas de la versión activa del POA que todavía no
// tienen catálogo técnico vigente — fuente única de verdad (Decisión 2,
// docs/architecture/poa-technical-catalog-decoupling.md), consumida por el
// Scheduler para bloquear la generación del Cronograma y por la pantalla de
// resultado de importación. `enabled` se pasa explícito: no tiene sentido
// consultar sin boardId ni poaVersionId (ej. board sin POA activo todavía).
// ─────────────────────────────────────────────────────────────────────────────

export function useMissingBoardActivityStandards(
  boardId: string | undefined,
  poaVersionId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['missing_board_activity_standards', boardId, poaVersionId],
    queryFn: async (): Promise<MissingActivityStandard[]> => {
      if (!boardId || !poaVersionId) return [];

      const { data, error } = await supabase.rpc('get_missing_board_activity_standards', {
        p_board_id: boardId,
        p_poa_version_id: poaVersionId,
      });

      if (error?.code === '42883') throw new SchedulerMigrationMissingError('get_missing_board_activity_standards');
      if (error) throw error;
      return (data ?? []) as MissingActivityStandard[];
    },
    enabled: !!boardId && !!poaVersionId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useUpsertActivityStandard
//
// Crea una nueva versión vigente de un estándar del Catálogo Técnico —
// nunca UPDATE (RLS lo bloquea explícitamente): board_activity_standards es
// insert-only, fn_insert_activity_standard() calcula la versión y cierra la
// fila anterior en la misma transacción. Sirve tanto para poblar una
// actividad pendiente (primera versión) como para corregir el rendimiento
// de una ya confirmada (nueva versión) — mismo mecanismo en ambos casos.
// group_id siempre NULL aquí: estándar de contrato, no excepción de sitio
// (esa distinción queda fuera de alcance de esta pantalla).
// ─────────────────────────────────────────────────────────────────────────────

// requiereRendimiento default true mantiene el contrato anterior (rendimiento
// obligatorio) sin romper a los llamadores existentes. Cuando es false,
// rendimiento se ignora aquí y se persiste NULL (Decisión 4, ver
// poa-technical-catalog-decoupling.md) — nunca 0 ni un número inventado.
export interface UpsertActivityStandardInput {
  boardId: string;
  activityKey: string;
  name: string;
  category: ActivityCategory;
  unit: string;
  rendimiento: number | null;
  requiereRendimiento?: boolean;
  priority?: ActivityPriority;
  source?: string;
}

export function useUpsertActivityStandard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertActivityStandardInput) => {
      const requiereRendimiento = input.requiereRendimiento ?? true;
      const { error } = await supabase.from('board_activity_standards').insert({
        board_id: input.boardId,
        group_id: null,
        activity_key: input.activityKey,
        name: input.name,
        category: input.category,
        unit: input.unit,
        rendimiento: requiereRendimiento ? input.rendimiento : null,
        requiere_rendimiento: requiereRendimiento,
        priority: input.priority ?? 'preferred',
        source: input.source ?? 'catalogo_tecnico_ui',
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['activity_standards', input.boardId] });
      queryClient.invalidateQueries({ queryKey: ['missing_board_activity_standards', input.boardId] });
    },
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
