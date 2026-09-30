/**
 * Service: Gatillo Determinístico de Materialización para Superficies Operativas (/my-work)
 * Baseline: Hito 6.4 (Gatillo Reactivo de Materialización para Tableros Vivos)
 * Gobernanza R1-b0 + R1-c: docs/gates/R1-b0_R1-c_SPEC.md v4.2 + Decisiones D1-D11
 *
 * Propósito:
 * 1. Evalúa si un plan publicado para un sitio/semana requiere materialización de ocurrencias.
 * 2. Si el plan existe pero no tiene ítems y el catálogo está configurado -> MATERIALIZA delegando en ensureWeeklyPlanMaterialized.
 * 3. Si el plan ya cuenta con ítems -> LECTURA PURA (NO TOCA, NO MUTAR).
 * 4. Idempotente y determinístico: 0 duplicados en ejecuciones repetidas.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  WeeklyPlan,
  WeeklyPlanItem,
} from '../types/weeklyPlan';
import {
  ensureWeeklyPlanMaterialized,
  MaterializeWeeklyPlanOptions,
} from './scheduleMaterializationService';

export type MaterializationTriggerAction = 'NO_OP' | 'MATERIALIZE';

export interface MyWorkMaterializationEvaluation {
  action: MaterializationTriggerAction;
  reason: 
    | 'ALREADY_MATERIALIZED'
    | 'EMPTY_PUBLISHED_PLAN'
    | 'NO_ACTIVE_CATALOG'
    | 'PLAN_NOT_FOUND'
    | 'DRAFT_PROTECTED'
    | 'IN_PROGRESS_PROTECTED'
    | 'CONFIRMED_IMMUTABLE'
    | 'CLOSED_IMMUTABLE'
    | 'CANCELLED_TERMINAL';
  existingPlan: WeeklyPlan | null;
  itemsCount: number;
  hasActiveCatalog: boolean;
}

export type MyWorkEvaluationResult = MyWorkMaterializationEvaluation;

export interface MyWorkTriggerResult {
  evaluation: MyWorkMaterializationEvaluation;
  weeklyPlan: WeeklyPlan | null;
  items: WeeklyPlanItem[];
  insertedCount: number;
  isMutated: boolean;
}

export type MyWorkMaterializationResult = MyWorkTriggerResult;
export type MyWorkTriggerOptions = MaterializeWeeklyPlanOptions;

function toISOStringDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMondayDate(d: Date | string): Date {
  const dt = typeof d === 'string' ? new Date(d) : new Date(d);
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + diff));
}

/**
 * 1. Evalúa de forma pura si una superficie /my-work necesita disparar la materialización.
 */
export async function evaluateMyWorkMaterializationNeed(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekInput: Date | string
): Promise<MyWorkMaterializationEvaluation> {
  const gId = groupId || null;
  const mondayDate = getMondayDate(weekInput);
  const weekStartStr = toISOStringDate(mondayDate);

  // 1. Buscar cabecera de plan semanal existente
  let planQuery = supabase
    .from('weekly_plans')
    .select('*')
    .eq('board_id', boardId);

  if (gId) {
    planQuery = planQuery.eq('group_id', gId);
  } else {
    planQuery = planQuery.is('group_id', null);
  }

  let planData: any = null;
  try {
    if (typeof (planQuery as any)?.or === 'function') {
      const res = await (planQuery as any)
        .or(`week_start_date.eq.${weekStartStr},start_date.eq.${weekStartStr}`)
        .maybeSingle();
      planData = res?.data ?? null;
    } else if (typeof (planQuery as any)?.maybeSingle === 'function') {
      const res = await (planQuery as any).maybeSingle();
      planData = res?.data ?? null;
    } else if (typeof (planQuery as any)?.then === 'function') {
      const res = await (planQuery as any);
      planData = Array.isArray(res?.data) ? res.data[0] : (res?.data ?? null);
    }
  } catch (_e) {
    planData = null;
  }

  if (!planData) {
    // Estado Inexistente (NULL) -> Autorizado para materializar
    return {
      action: 'MATERIALIZE',
      reason: 'PLAN_NOT_FOUND',
      existingPlan: null,
      itemsCount: 0,
      hasActiveCatalog: true,
    };
  }

  const existingPlan = planData as WeeklyPlan;
  const status = existingPlan.status;

  // 2. Evaluación de Estados Inmutables y Protegidos
  if (status === 'draft') {
    return { action: 'NO_OP', reason: 'DRAFT_PROTECTED', existingPlan, itemsCount: 0, hasActiveCatalog: true };
  }
  if (status === 'in_progress') {
    return { action: 'NO_OP', reason: 'IN_PROGRESS_PROTECTED', existingPlan, itemsCount: 0, hasActiveCatalog: true };
  }
  if (status === 'confirmed') {
    return { action: 'NO_OP', reason: 'CONFIRMED_IMMUTABLE', existingPlan, itemsCount: 0, hasActiveCatalog: true };
  }
  if (status === 'closed') {
    return { action: 'NO_OP', reason: 'CLOSED_IMMUTABLE', existingPlan, itemsCount: 0, hasActiveCatalog: true };
  }
  if (status === 'cancelled') {
    return { action: 'NO_OP', reason: 'CANCELLED_TERMINAL', existingPlan, itemsCount: 0, hasActiveCatalog: true };
  }

  // 3. Estado 'published': Conteo de ítems asociados
  const { count: itemsCount } = await supabase
    .from('weekly_plan_items')
    .select('*', { count: 'exact', head: true })
    .eq('plan_id', existingPlan.id);

  const totalItems = itemsCount ?? 0;

  if (totalItems > 0) {
    // Plan published ya poblado con topología existente -> Lectura Pura (NO tocar)
    return {
      action: 'NO_OP',
      reason: 'ALREADY_MATERIALIZED',
      existingPlan,
      itemsCount: totalItems,
      hasActiveCatalog: true,
    };
  }

  // 4. Plan published con 0 ítems: Verificar si existen actividades configuradas en el catálogo
  const { data: standards } = await supabase
    .from('board_activity_standards')
    .select('id, activity_key, rendimiento')
    .eq('board_id', boardId)
    .eq('requiere_rendimiento', true);

  const hasActiveCatalog = (standards || []).length > 0;

  if (hasActiveCatalog) {
    return {
      action: 'MATERIALIZE',
      reason: 'EMPTY_PUBLISHED_PLAN',
      existingPlan,
      itemsCount: 0,
      hasActiveCatalog: true,
    };
  }

  return {
    action: 'NO_OP',
    reason: 'NO_ACTIVE_CATALOG',
    existingPlan,
    itemsCount: 0,
    hasActiveCatalog: false,
  };
}

/**
 * Gatillo Operativo Independiente para /my-work.
 *
 * Si la evaluación pura determina MATERIALIZE, delega en ensureWeeklyPlanMaterialized
 * (una sola tubería: clasificación, D4, D5, D10, P3 y verificación post-RPC) y luego lee los ítems del plan.
 * Si la evaluación determina NO_OP, retorna el plan existente sin mutaciones.
 */
export async function materializeWeeklyPlanForTrigger(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekInput: Date | string,
  options: MyWorkTriggerOptions = {}
): Promise<MyWorkMaterializationResult> {
  const gId = groupId || null;
  if (!gId) {
    // Delegar en ensureWeeklyPlanMaterialized para registrar evento MISSING_GROUP_ID (D10)
    await ensureWeeklyPlanMaterialized(supabase, boardId, null, weekInput, options);
  }

  // Paso 1: Evaluación determinista de lectura pura
  const evaluation = await evaluateMyWorkMaterializationNeed(supabase, boardId, gId, weekInput);

  if (evaluation.action === 'NO_OP') {
    let items: WeeklyPlanItem[] = [];
    if (evaluation.existingPlan) {
      const { data: itemsData } = await supabase
        .from('weekly_plan_items')
        .select('*')
        .eq('plan_id', evaluation.existingPlan.id);
      items = (itemsData || []) as WeeklyPlanItem[];
    }
    return {
      evaluation,
      weeklyPlan: evaluation.existingPlan,
      items,
      insertedCount: 0,
      isMutated: false,
    };
  }

  // Paso 2: Delegar en ensureWeeklyPlanMaterialized (única tubería canónica)
  const syncResult = await ensureWeeklyPlanMaterialized(
    supabase,
    boardId,
    gId,
    weekInput,
    options
  );

  const { data: itemsData } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('plan_id', syncResult.weeklyPlan.id);

  const items = (itemsData || []) as WeeklyPlanItem[];

  return {
    evaluation,
    weeklyPlan: syncResult.weeklyPlan,
    items,
    insertedCount: syncResult.insertedCount,
    isMutated: true,
  };
}

export const triggerMyWorkMaterialization = materializeWeeklyPlanForTrigger;
