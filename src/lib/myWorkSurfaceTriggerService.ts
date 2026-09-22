/**
 * Service: Gatillo Independiente de Superficie para /my-work (Fase 5.1)
 * Baseline: 102 suites / 768 tests / TS 0 errores (M5 FROZEN)
 * 
 * Invariantes Contractuales F5.1:
 * - F5.1-INV-01: Separación estricta entre lectura pura inicial y mutación determinista.
 * - F5.1-INV-02: Matriz exhaustiva de estados de cabecera (Protección de draft, in_progress, confirmed, closed, cancelled).
 * - F5.1-INV-03: Definición contractual de conteo: COUNT(*) de filas asociadas al plan_id en weekly_plan_items.
 * - F5.1-INV-04: Preservación absoluta de ítems en in_progress, completed, cancelled y con is_manual_override = true.
 * - F5.1-INV-05: Exclusividad del Gateway V6 RPC (ensure_weekly_plan_header + sync_weekly_plan_items_rpc) - CERO mutaciones PostgREST directas.
 * - F5.1-INV-06: Aislamiento total del Solver H8 (🔴 STRICTLY NO-GO).
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  generateRoutineScheduleForWeek,
  RoutineBaseTemplate,
} from './routineScheduler';
import { calculateContractWeek } from './weeklyPlanner';
import { WeeklyPlan, WeeklyPlanItem } from '../types/weeklyPlan';

export type MyWorkTriggerAction = 'MATERIALIZE' | 'NO_OP';

export type MyWorkTriggerReason =
  | 'PLAN_NOT_FOUND'
  | 'EMPTY_PUBLISHED_PLAN'
  | 'ALREADY_MATERIALIZED'
  | 'DRAFT_PROTECTED'
  | 'IN_PROGRESS_PROTECTED'
  | 'CONFIRMED_IMMUTABLE'
  | 'CLOSED_IMMUTABLE'
  | 'CANCELLED_TERMINAL'
  | 'NO_ACTIVE_CATALOG';

export interface MyWorkEvaluationResult {
  action: MyWorkTriggerAction;
  reason: MyWorkTriggerReason;
  existingPlan: WeeklyPlan | null;
  itemsCount: number;
  hasActiveCatalog: boolean;
}

export interface MyWorkTriggerOptions {
  customNonWorkingDays?: string[];
  forceUpdate?: boolean;
}

export interface MyWorkMaterializationResult {
  evaluation: MyWorkEvaluationResult;
  weeklyPlan: WeeklyPlan | null;
  items: WeeklyPlanItem[];
  insertedCount: number;
  isMutated: boolean;
}

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
 * Evalúa de forma pura (SELECT exclusivo) si la semana/sitio objetivo requiere materialización
 * según la matriz formal de estados de F5.1.
 */
export async function evaluateMyWorkMaterializationNeed(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekInput: Date | string
): Promise<MyWorkEvaluationResult> {
  const gId = groupId || null;
  const mondayDate = getMondayDate(weekInput);
  const weekStartStr = toISOStringDate(mondayDate);

  // 1. Consulta pura de cabecera weekly_plans
  let planQuery = supabase
    .from('weekly_plans')
    .select('*')
    .eq('board_id', boardId);

  if (gId) {
    planQuery = planQuery.eq('group_id', gId);
  } else {
    planQuery = planQuery.is('group_id', null);
  }

  // Compatibilidad con columnas week_start / week_start_date
  planQuery = planQuery.or(`week_start.eq.${weekStartStr},week_start_date.eq.${weekStartStr}`);

  const { data: planData } = await planQuery.maybeSingle();

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
 * Si la evaluación pura determina MATERIALIZE, orquesta la persistencia
 * EXCLUSIVAMENTE a través del Gateway V6 (RPCs certificados).
 * Si la evaluación determina NO_OP, retorna el plan existente sin mutaciones.
 */
export async function triggerMyWorkMaterialization(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekInput: Date | string,
  options: MyWorkTriggerOptions = {}
): Promise<MyWorkMaterializationResult> {
  const gId = groupId || null;
  const mondayDate = getMondayDate(weekInput);
  const weekStartStr = toISOStringDate(mondayDate);
  const periodNumber = calculateContractWeek(mondayDate);

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

  // Paso 2: Obtener versión activa de POA y Catálogo Técnico
  let activePoaVersionId: string | null = null;
  const { data: activePoaVer } = await supabase
    .from('poa_versions')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  activePoaVersionId = activePoaVer?.id || null;

  const poaActivitiesMap = new Map<string, { id: string; frecuencia: number }>();
  const { data: poaActs } = await supabase
    .from('poa_activities')
    .select('id, activity_key, frecuencia');

  for (const pa of poaActs || []) {
    if (pa.frecuencia !== null && pa.frecuencia > 0) {
      poaActivitiesMap.set(pa.activity_key, {
        id: pa.id,
        frecuencia: Number(pa.frecuencia),
      });
    }
  }

  const { data: standards } = await supabase
    .from('board_activity_standards')
    .select('*')
    .eq('board_id', boardId)
    .eq('requiere_rendimiento', true);

  const { data: scopeMappings } = await supabase
    .from('activity_scope_mappings')
    .select('*');

  const scopeByKey = new Map<string, string>();
  for (const sm of scopeMappings || []) {
    scopeByKey.set(sm.activity_key, sm.scope_key);
  }

  let scopeData: Record<string, number> = {};
  if (gId) {
    const { data: raRow } = await supabase
      .from('resource_analysis')
      .select('scope_data')
      .eq('board_id', boardId)
      .eq('site_id', gId)
      .maybeSingle();
    scopeData = (raRow?.scope_data as Record<string, number>) ?? {};
  }

  // Paso 3: Proyección pura F3.1 (routineScheduler)
  const templates: RoutineBaseTemplate[] = [];
  for (const std of standards || []) {
    const poaInfo = poaActivitiesMap.get(std.activity_key);
    const frecuencia = poaInfo?.frecuencia ?? Number(std.frecuencia) ?? 1;
    const scopeKey = scopeByKey.get(std.activity_key) || std.activity_key;
    const cantidad = typeof scopeData[scopeKey] === 'number'
      ? scopeData[scopeKey]
      : (typeof scopeData[std.activity_key] === 'number' ? scopeData[std.activity_key] : 0);
    const rendimiento = Number(std.rendimiento);

    if (cantidad > 0 && rendimiento > 0) {
      templates.push({
        id: std.id,
        activity_key: std.activity_key,
        name: std.name,
        zone: std.category || 'Zona Verde',
        unit: std.unit,
        rendimiento,
        frecuencia,
        cantidad,
      });
    }
  }

  const projection = generateRoutineScheduleForWeek(
    templates,
    mondayDate,
    [],
    { customNonWorkingDays: options.customNonWorkingDays }
  );

  // Paso 4: Persistencia EXCLUSIVA a través del Gateway V6 RPC (Sin PostgREST directo)
  // 4.1 Gateway de Cabecera
  const { data: headerPlanId, error: headerErr } = await supabase.rpc('ensure_weekly_plan_header', {
    p_board_id: boardId,
    p_group_id: gId,
    p_week_start: weekStartStr,
    p_period_number: periodNumber,
  });

  if (headerErr || !headerPlanId) {
    throw new Error(`F5.1 V6 Gateway Error (ensure_weekly_plan_header): ${headerErr?.message || 'No plan ID returned'}`);
  }

  // 4.2 Gateway de Sincronización de Ítems
  const dtoItems = projection.assignments.map((assign, idx) => {
    const matchedStd = (standards || []).find((s) => s.activity_key === assign.activity_key);
    return {
      planned_sequence: idx + 1,
      activity_key: assign.activity_key,
      activity_standard_id: matchedStd?.id ?? null,
      planned_rendimiento: matchedStd?.rendimiento ?? 500,
      planned_frecuencia: assign.frequency_interval,
      priority: matchedStd?.priority ?? 'must_execute',
      planned_qty: assign.cantidad,
      unit: assign.unit,
      planned_jr: assign.theoretical_jr,
      planned_date: assign.dateStr,
    };
  });

  const { data: syncedRows, error: syncErr } = await supabase.rpc('sync_weekly_plan_items_rpc', {
    p_plan_id: headerPlanId,
    p_items: dtoItems,
  });

  if (syncErr) {
    throw new Error(`F5.1 V6 Gateway Error (sync_weekly_plan_items_rpc): ${syncErr.message}`);
  }

  const weeklyPlan: WeeklyPlan = {
    id: headerPlanId,
    board_id: boardId,
    group_id: gId,
    week_start_date: weekStartStr,
    week_end_date: weekStartStr,
    status: 'published',
  };

  const items = (syncedRows || []) as WeeklyPlanItem[];

  return {
    evaluation,
    weeklyPlan,
    items,
    insertedCount: items.length,
    isMutated: true,
  };
}
