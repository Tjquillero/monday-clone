'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB, generateUUID } from '@/lib/offlineDB';
import { isNetworkError } from './useBoardData';
import { useAuth } from '@/contexts/AuthContext';
import {
  WeeklyPlan, WeeklyPlanItem, WeeklyPlanItemExecution,
  ActivityPriority, MissingEvidenceError, MissingTechnicalConfigError,
} from '@/types/scheduler';
import { weeklyPlanKeys } from './useWeeklyPlans';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de entrada para mutaciones
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePlanInput {
  boardId: string;
  groupId: string;
  weekStart: string;    // ISO date 'YYYY-MM-DD'
  periodNumber: number; // 1–4
}

// Snapshot del estándar al momento de planificar.
// Se genera desde PlanningActivity + poa_activity_zone_id resuelto (ADR-0002).
export interface PlanItemInput {
  planned_sequence:    number;
  activity_key:        string;
  poa_activity_zone_id: string;
  planned_rendimiento: number;
  planned_frecuencia:  number;
  priority:            ActivityPriority;
  planned_qty:         number;
  unit:                string;
  planned_jr:          number;
}

export interface CreateExecutionInput {
  plan_item_id:    string;
  plan_id:         string;       // para invalidación de caché específica
  group_id:        string;       // para invalidación de caché específica
  execution_date:  string;       // ISO date
  crew_name?:      string | null;
  crew_leader_id?: string | null;
  worker_count:    number;
  started_at:      string;       // ISO timestamptz
  finished_at:     string;
  executed_qty:    number;
  notes?:          string | null;
}

export interface UpdateDraftExecutionInput {
  crew_name?:      string | null;
  crew_leader_id?: string | null;
  worker_count?:   number;
  started_at?:     string;
  finished_at?:    string;
  executed_qty?:   number;
  notes?:          string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// useWeeklyPlanMutations
//
// Cubre el ciclo completo:
//   Asistente: createPlan → savePlanItems → publishPlan → confirmPlan
//   Líder:     createExecution → reportExecution
//   Supervisor:                              verifyExecution | rejectExecution
//   Admin:                                                     closePlan
//
// Las transiciones de estado llaman a funciones SECURITY DEFINER vía RPC;
// la base de datos valida el rol y el estado previo antes de escribir.
// ─────────────────────────────────────────────────────────────────────────────

export function useWeeklyPlanMutations(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Helper: invalida queries del plan y opcionalmente la lista del grupo.
  // Si se conoce groupId, invalida solo ese grupo (evita refetch de todos los planes del board).
  const invalidatePlan = (planId: string, groupId?: string) => {
    queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.plan(planId) });
    queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.items(planId) });
    if (boardId && groupId) {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.byGroup(boardId, groupId) });
    } else if (boardId) {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.all(boardId) });
    }
  };

  // ── createPlan ──────────────────────────────────────────────────────────────
  // Crea un plan en estado 'draft'. El asistente puede después llamar savePlanItems
  // para poblar las actividades planificadas.

  const createPlan = useMutation<WeeklyPlan, Error, CreatePlanInput>({
    mutationFn: async ({ boardId: bid, groupId, weekStart, periodNumber }) => {
      if (!user?.id) throw new Error('Usuario no autenticado');
      const { data, error } = await supabase
        .from('weekly_plans')
        .insert({
          board_id:      bid,
          group_id:      groupId,
          week_start:    weekStart,
          period_number: periodNumber,
          created_by:    user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WeeklyPlan;
    },
    onSuccess: (plan) => {
      invalidatePlan(plan.id, plan.group_id);
    },
  });

  // ── savePlanItems ───────────────────────────────────────────────────────────
  // Reemplaza todos los items del plan en una sola transacción vía RPC.
  // La función PostgreSQL hace DELETE + INSERT atómicos: si falla el INSERT,
  // el DELETE se revierte y el plan nunca queda vacío.

  const savePlanItems = useMutation<
    WeeklyPlanItem[],
    Error,
    { planId: string; items: PlanItemInput[] }
  >({
    mutationFn: async ({ planId, items }) => {
      const { data, error } = await supabase.rpc('replace_weekly_plan_items', {
        p_plan_id: planId,
        p_items:   items,
      });
      if (error) throw error;
      return (data ?? []) as WeeklyPlanItem[];
    },
    onSuccess: (_, { planId }) => {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.items(planId) });
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.plan(planId) });
    },
  });

  // ── publishPlan ─────────────────────────────────────────────────────────────
  // draft → published. La función SQL valida: rol (admin|assistant) + estado previo.

  const publishPlan = useMutation<void, Error, { planId: string; groupId?: string }>({
    mutationFn: async ({ planId }) => {
      const { error } = await supabase.rpc('publish_weekly_plan', { p_plan_id: planId });
      if (error) throw error;
    },
    onSuccess: (_, { planId, groupId }) => {
      invalidatePlan(planId, groupId);
    },
  });

  // ── confirmPlan ─────────────────────────────────────────────────────────────
  // in_progress|published → confirmed.
  // La función SQL bloquea si hay ejecuciones en estado 'reported' sin verificar.

  const confirmPlan = useMutation<void, Error, { planId: string; groupId?: string }>({
    mutationFn: async ({ planId }) => {
      const { error } = await supabase.rpc('confirm_weekly_plan', { p_plan_id: planId });
      if (error) {
        throw MissingTechnicalConfigError.fromSupabaseError(error)
          ?? MissingEvidenceError.fromSupabaseError(error)
          ?? error;
      }
    },
    onSuccess: (_, { planId, groupId }) => {
      invalidatePlan(planId, groupId);
    },
  });

  // ── closePlan ───────────────────────────────────────────────────────────────
  // confirmed → closed. Solo admin.
  // Efecto secundario: genera activity_performance_observations.

  const closePlan = useMutation<void, Error, { planId: string; groupId?: string }>({
    mutationFn: async ({ planId }) => {
      const { error } = await supabase.rpc('close_weekly_plan', { p_plan_id: planId });
      if (error) throw error;
    },
    onSuccess: (_, { planId, groupId }) => {
      invalidatePlan(planId, groupId);
    },
  });

  // ── createExecution ─────────────────────────────────────────────────────────
  // El líder registra una jornada de trabajo. El trigger automáticamente
  // transiciona el plan a 'in_progress' si estaba en 'published'.

  const createExecution = useMutation<WeeklyPlanItemExecution, Error, CreateExecutionInput>({
    mutationFn: async ({ plan_id: _planId, group_id: _groupId, ...dbInput }) => {
      if (!user?.id) throw new Error('Usuario no autenticado');
      const { data, error } = await supabase
        .from('weekly_plan_item_executions')
        .insert({ ...dbInput, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as WeeklyPlanItemExecution;
    },
    onSuccess: (exec, { plan_id, group_id }) => {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.executions(exec.plan_item_id) });
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.items(plan_id) });
      // El plan puede haber transitado published → in_progress por el trigger
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.plan(plan_id) });
      if (boardId) queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.byGroup(boardId, group_id) });
      // Mis actividades (líder) agrega items por semana publicada
      queryClient.invalidateQueries({ queryKey: ['weekly_plans', 'published_week'] });
    },
  });

  // ── updateDraftExecution ────────────────────────────────────────────────────
  // El líder corrige datos antes de reportar. RLS solo permite si status='draft'.

  const updateDraftExecution = useMutation<
    void,
    Error,
    { executionId: string; planItemId: string; changes: UpdateDraftExecutionInput }
  >({
    mutationFn: async ({ executionId, changes }) => {
      if (!user?.id) throw new Error('Usuario no autenticado');
      const { error } = await supabase
        .from('weekly_plan_item_executions')
        .update({ ...changes, updated_by: user.id })
        .eq('id', executionId)
        .eq('status', 'draft');    // guard explícito además del RLS
      if (error) throw error;
    },
    onSuccess: (_, { planItemId }) => {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.executions(planItemId) });
    },
  });

  // ── reportExecution ─────────────────────────────────────────────────────────
  // draft → reported. La función SQL valida quién puede reportar y si es el creador.
  //
  // Sin conexión (o si el RPC falla por red aunque el navegador se crea
  // online), en vez de lanzar el error se encola un comando de dominio
  // REPORT_EXECUTION (carril 2, offline-certification-design.md) para que
  // useOfflineSync lo reproduzca al reconectar. El servidor sigue siendo el
  // único que ejecuta la transición de estado — este mutationFn nunca marca
  // la ejecución como reportada localmente, solo registra la intención.
  //
  // commandId se genera UNA vez, antes de intentar nada, y viaja igual por
  // las dos rutas (RPC directo u offlineDB.addCommand): si el intento online
  // falla justo entre la ejecución del RPC y la respuesta (isNetworkError),
  // el reintento — sea inmediato o vía la cola — usa el MISMO command_id, así
  // que report_execution() en el servidor lo reconoce como el mismo intento
  // en vez de repetir la transición (ver migración 20260718, idempotencia).

  const reportExecution = useMutation<
    { queued: boolean }, Error, { executionId: string; planItemId: string }
  >({
    mutationFn: async ({ executionId }) => {
      const commandId = generateUUID();
      const offline = typeof window !== 'undefined' && !window.navigator.onLine;
      if (!offline) {
        const { error } = await supabase.rpc('report_execution', { p_execution_id: executionId, p_command_id: commandId });
        if (!error) return { queued: false };
        if (!isNetworkError(error)) throw error; // fallo semántico real: no encolar, mostrar al líder
      }
      if (!offlineDB) throw new Error('Sin conexión y sin caché local disponible.');
      await offlineDB.addCommand({
        id: commandId,
        type: 'REPORT_EXECUTION',
        entity_id: executionId,
        payload: { p_execution_id: executionId, p_command_id: commandId },
      });
      return { queued: true };
    },
    onSuccess: (_, { planItemId }) => {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.executions(planItemId) });
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.items(planItemId) });
      // El trigger actualiza executed_qty/executed_jr del item (reported+verified):
      // refrescar la vista agregada del líder
      queryClient.invalidateQueries({ queryKey: ['weekly_plans', 'published_week'] });
      queryClient.invalidateQueries({ queryKey: ['domain_commands'] });
    },
  });

  // ── verifyExecution ─────────────────────────────────────────────────────────
  // reported → verified. Solo supervisor o admin.

  const verifyExecution = useMutation<
    void, Error, { executionId: string; planItemId: string }
  >({
    mutationFn: async ({ executionId }) => {
      const { error } = await supabase.rpc('verify_execution', { p_execution_id: executionId });
      if (error) throw error;
    },
    onSuccess: (_, { planItemId }) => {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.executions(planItemId) });
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.items(planItemId) });
    },
  });

  // ── rejectExecution ─────────────────────────────────────────────────────────
  // reported → rejected. Solo supervisor o admin. Notas de rechazo obligatorias.

  const rejectExecution = useMutation<
    void, Error, { executionId: string; planItemId: string; notes: string }
  >({
    mutationFn: async ({ executionId, notes }) => {
      const { error } = await supabase.rpc('reject_execution', {
        p_execution_id: executionId,
        p_notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: (_, { planItemId }) => {
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.executions(planItemId) });
      queryClient.invalidateQueries({ queryKey: weeklyPlanKeys.items(planItemId) });
    },
  });

  return {
    // Plan lifecycle
    createPlan,
    savePlanItems,
    publishPlan,
    confirmPlan,
    closePlan,
    // Execution lifecycle
    createExecution,
    updateDraftExecution,
    reportExecution,
    verifyExecution,
    rejectExecution,
  };
}

// Nota: el estado técnico de sincronización por ejecución (¿hay un
// REPORT_EXECUTION pendiente/sincronizando/en conflicto?) vive en
// src/hooks/useSyncState.ts (useExecutionSyncStatuses) — único origen de
// verdad reutilizado por Mis Actividades, Verificación y la bandeja de
// conflictos (Incremento 4c). Antes había una versión local aquí
// (useQueuedReportExecutionIds) que solo devolvía un booleano; se consolidó
// para no mantener dos lecturas separadas de la misma cola.
