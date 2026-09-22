/**
 * Service: Motor de Proyección, Diagnóstico y Reprogramación Gobernada del Cronograma (Hito 6.1 · ADR-0013 v1.2)
 * Baseline Rectora de Entrada: 107 suites / 833 tests / TS 0 errores
 * 
 * Principios Arquitectónicos:
 * 1. Read Model Consultivo Puro: evaluateMaintenanceScheduleView (0 mutaciones a BD, 0 efectos secundarios).
 * 2. Command Validator: validateRescheduleCommand (validación determinista de compuertas séxtuples).
 * 3. Gateway de Escritura Seguro con OCC Real: reschedulePlanItemValidated (control de concurrencia optimista y autoridad final).
 * 4. Invarianza de Identidad (Opción B): occurrence_key es estrictamente inmutable (identifica el slot original de materialización).
 * 5. Trazabilidad Acumulativa con 0 DDL: Preservación estructurada de override_reason e is_manual_override = true.
 * 6. Calendario Laboral Colombiano Soberano: Consumo exclusivo de isOperationalWorkingDay (ADR-0007 / Ley Emiliani).
 * 7. Consumo Soberano de Capacidad H4.9: CONF-02 dispara exclusivamente ante capacityStatus === 'OVERLOADED'.
 * 8. Semántica de Proximidad D+0/D+1/D+2: CONF-04 evalúa diferencia de días calendario enteros (0 a 2 días).
 * 9. Aislamiento Total: Cero dependencias y cero llamadas a optimizadores autónomos.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { WeeklyPlan, WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Crew } from '@/types/crew';
import { isOperationalWorkingDay } from './routineScheduler';
import { DailyCrewWorkload } from './operationalCapacityService';

export type UserRole =
  | 'admin'
  | 'coordinator'
  | 'supervisor'
  | 'crew_leader'
  | 'worker'
  | 'director'
  | 'verifier'
  | 'viewer'
  | string;

export interface TrustedAuthContext {
  userId: string;
  boardId: string;
  userRoles: Array<{ board_id: string; role: UserRole }>;
}

export type RescheduleReasonCode =
  | 'WEATHER_DELAY'
  | 'OPERATIONAL_PRIORITY'
  | 'LOGISTICS_EQUIPMENT'
  | 'SUPERVISOR_ADJUSTMENT';

export type ScheduleConflictCode =
  | 'CONF-01'
  | 'CONF-02'
  | 'CONF-03'
  | 'CONF-04'
  | 'CONF-05';

export interface ScheduleConflict {
  conflictId: string;
  conflictCode: ScheduleConflictCode;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'CALENDAR' | 'CAPACITY' | 'TEMPORAL' | 'CREW' | 'PRECEDENCE';
  itemId: string;
  activityKey: string;
  activityName: string;
  plannedDate: string;
  crewId: string | null;
  description: string;
  suggestedAction: string;
}

export interface ScheduleOccurrenceProjection {
  itemId: string;
  weeklyPlanId: string;
  boardId: string;
  groupId: string | null;
  activityKey: string;
  name: string;
  zone: string;
  unit: string;
  plannedDate: string;
  plannedQty: number;
  theoreticalJr: number;
  sourceType: 'ROUTINE' | 'INCIDENT' | 'MANUAL';
  routineReference: string;
  occurrenceKey: string;
  crewId: string | null;
  crewName: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  hasExecutions: boolean;
  totalExecutedQtyVerified: number;
  isRescheduled: boolean;
  overrideReason: string | null;
  conflicts: ScheduleConflict[];
}

export interface MaintenanceScheduleParams {
  boardId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  evaluatedAt: string; // ISO Timestamp
  plans: WeeklyPlan[];
  planItems: WeeklyPlanItem[];
  executions: ExecutionRecord[];
  crews: Crew[];
  crewWorkloads: DailyCrewWorkload[];
  authContext: TrustedAuthContext;
  customNonWorkingDays?: string[];
}

export interface MaintenanceScheduleViewData {
  boardId: string;
  periodStart: string;
  periodEnd: string;
  referenceDate: string;
  evaluatedAt: string;
  totalPlannedItemsCount: number;
  totalPlannedJournals: number;
  conflictsSummary: {
    totalConflicts: number;
    highSeverityCount: number;
    mediumSeverityCount: number;
    lowSeverityCount: number;
    byCode: Record<ScheduleConflictCode, number>;
  };
  occurrences: ScheduleOccurrenceProjection[];
  occurrencesByDate: Record<string, ScheduleOccurrenceProjection[]>;
  occurrencesByCrew: Record<string, ScheduleOccurrenceProjection[]>;
  conflicts: ScheduleConflict[];
}

export interface ReschedulePlanItemInput {
  planItemId: string;
  targetDate: string; // YYYY-MM-DD
  reasonCode: RescheduleReasonCode;
  notes?: string;
}

export interface RescheduleValidationContext {
  plan: WeeklyPlan;
  item: WeeklyPlanItem;
  executions: ExecutionRecord[];
  actas?: Array<{ id: string; board_id: string; status: string; items?: Array<{ weekly_plan_item_id: string }> }>;
  customNonWorkingDays?: string[];
}

export interface RescheduleValidationResult {
  allowed: boolean;
  action: 'RESCHEDULE' | 'NO_OP' | 'REJECT';
  reasonCode: string;
  message: string;
  currentItem: WeeklyPlanItem | null;
  currentPlannedDate: string | null;
  targetPlannedDate: string;
  extendedOverrideReason: string | null;
}

export interface ReschedulePlanItemResult {
  validation: RescheduleValidationResult;
  success: boolean;
  updatedItem: WeeklyPlanItem | null;
}

/**
 * Deriva la fecha de referencia en formato YYYY-MM-DD en el huso horario contractual 'America/Bogota'.
 */
function deriveReferenceDate(evaluatedAtIso: string): string {
  const d = new Date(evaluatedAtIso);
  if (isNaN(d.getTime())) {
    throw new Error(`[H6.1 Invalid Timestamp] Formato evaluatedAt inválido: ${evaluatedAtIso}`);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Calcula la diferencia en días calendario entre dos cadenas YYYY-MM-DD (d1 - d2).
 */
function calculateCalendarDaysDiff(d1Str: string, d2Str: string): number {
  const [y1, m1, day1] = d1Str.split('-').map(Number);
  const [y2, m2, day2] = d2Str.split('-').map(Number);
  const utcD1 = Date.UTC(y1, m1 - 1, day1);
  const utcD2 = Date.UTC(y2, m2 - 1, day2);
  const diffMs = utcD1 - utcD2;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Valida si el contexto de autenticación posee permisos de edición sobre el tablero.
 */
function hasReschedulePermission(authContext: TrustedAuthContext, boardId: string): { allowed: boolean; reasonCode: string; message: string } {
  if (authContext.boardId !== boardId) {
    return {
      allowed: false,
      reasonCode: 'BOARD_MISMATCH',
      message: `El usuario autenticado pertenece a un tablero distinto (${authContext.boardId}) al del ítem (${boardId}).`,
    };
  }
  const authorizedRoles = ['admin', 'coordinator', 'supervisor'];
  const isAuthorized = authContext.userRoles.some(
    (r) => r.board_id === boardId && authorizedRoles.includes(r.role)
  );
  if (!isAuthorized) {
    return {
      allowed: false,
      reasonCode: 'UNAUTHORIZED_ROLE',
      message: `El usuario no tiene privilegios de reprogramación ('admin' | 'coordinator' | 'supervisor') sobre el tablero ${boardId}.`,
    };
  }
  return { allowed: true, reasonCode: 'AUTHORIZED', message: 'Autorizado.' };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Read Model Consultivo Puro: Proyección del Cronograma y Diagnóstico
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function evaluateMaintenanceScheduleView(
  params: MaintenanceScheduleParams
): MaintenanceScheduleViewData {
  const referenceDate = deriveReferenceDate(params.evaluatedAt);
  const customDays = params.customNonWorkingDays || [];

  // Filtrar ítems pertenecientes al tablero y al periodo especificado
  const relevantItems = params.planItems.filter((item) => {
    if (item.board_id !== params.boardId) return false;
    return item.planned_date >= params.periodStart && item.planned_date <= params.periodEnd;
  });

  const crewMap = new Map<string, Crew>();
  for (const c of params.crews) {
    crewMap.set(c.id, c);
  }

  // Mapear ejecuciones por item_id
  const execMap = new Map<string, ExecutionRecord[]>();
  for (const e of params.executions) {
    const list = execMap.get(e.weekly_plan_item_id) || [];
    list.push(e);
    execMap.set(e.weekly_plan_item_id, list);
  }

  // Mapear sobrecargas desde H4.9 por `${crewId}__${plannedDate}`
  const overloadMap = new Map<string, DailyCrewWorkload>();
  for (const w of params.crewWorkloads) {
    if (w.capacityStatus === 'OVERLOADED') {
      overloadMap.set(`${w.crewId}__${w.plannedDate}`, w);
    }
  }

  const allConflicts: ScheduleConflict[] = [];
  const occurrences: ScheduleOccurrenceProjection[] = [];
  const occurrencesByDate: Record<string, ScheduleOccurrenceProjection[]> = {};
  const occurrencesByCrew: Record<string, ScheduleOccurrenceProjection[]> = {};

  let totalPlannedItemsCount = 0;
  let totalPlannedJournals = 0;

  for (const item of relevantItems) {
    totalPlannedItemsCount += 1;
    totalPlannedJournals += Number(item.theoretical_jr || 0);

    const itemExecs = execMap.get(item.id) || [];
    const hasExecutions = itemExecs.some((e) => e.verification_status !== 'rejected');
    const verifiedExecs = itemExecs.filter(
      (e) => e.verification_status === 'verified' || e.verification_status === 'confirmed' || e.verification_status === 'closed'
    );
    const totalExecutedQtyVerified = verifiedExecs.reduce((sum, e) => sum + (Number(e.executed_qty) || 0), 0);
    const isRescheduled = Boolean(item.is_manual_override);

    const crew = item.crew_id ? crewMap.get(item.crew_id) : null;
    const crewName = crew ? crew.name : null;

    const itemConflicts: ScheduleConflict[] = [];

    // CONF-01: Día no hábil o festivo en Colombia (Consumo soberano de routineScheduler / Ley Emiliani)
    const isWorking = isOperationalWorkingDay(item.planned_date, customDays);
    if (!isWorking) {
      const conf: ScheduleConflict = {
        conflictId: `${params.boardId}__CONF-01__${item.id}__${item.planned_date}`,
        conflictCode: 'CONF-01',
        severity: 'HIGH',
        category: 'CALENDAR',
        itemId: item.id,
        activityKey: item.activity_key,
        activityName: item.name,
        plannedDate: item.planned_date,
        crewId: item.crew_id || null,
        description: `La actividad ${item.name} está programada en día no hábil o festivo (${item.planned_date}).`,
        suggestedAction: 'Reprogramar la actividad a un día hábil operativo.',
      };
      itemConflicts.push(conf);
      allConflicts.push(conf);
    }

    // CONF-02: Sobrecarga de capacidad de cuadrilla (Consumo soberano H4.9)
    if (item.crew_id) {
      const overload = overloadMap.get(`${item.crew_id}__${item.planned_date}`);
      if (overload) {
        const conf: ScheduleConflict = {
          conflictId: `${params.boardId}__CONF-02__${item.id}__${item.planned_date}`,
          conflictCode: 'CONF-02',
          severity: 'MEDIUM',
          category: 'CAPACITY',
          itemId: item.id,
          activityKey: item.activity_key,
          activityName: item.name,
          plannedDate: item.planned_date,
          crewId: item.crew_id,
          description: `La cuadrilla ${overload.crewName} presenta sobrecarga de capacidad (${overload.totalPlannedJournals} JR planeados vs ${overload.applicableDailyCapacity} JR disponibles).`,
          suggestedAction: 'Reasignar actividades o redistribuir carga temporal entre cuadrillas.',
        };
        itemConflicts.push(conf);
        allConflicts.push(conf);
      }
    }

    // CONF-03: Tarea atrasada no ejecutada
    if (item.status === 'planned' && item.planned_date < referenceDate && !hasExecutions) {
      const conf: ScheduleConflict = {
        conflictId: `${params.boardId}__CONF-03__${item.id}__${item.planned_date}`,
        conflictCode: 'CONF-03',
        severity: 'HIGH',
        category: 'TEMPORAL',
        itemId: item.id,
        activityKey: item.activity_key,
        activityName: item.name,
        plannedDate: item.planned_date,
        crewId: item.crew_id || null,
        description: `La actividad ${item.name} se encuentra atrasada (fecha programada ${item.planned_date} anterior a ${referenceDate}).`,
        suggestedAction: 'Reprogramar fecha de ejecución o reportar avance operativo.',
      };
      itemConflicts.push(conf);
      allConflicts.push(conf);
    }

    // CONF-04: Tarea sin cuadrilla en ventana de proximidad D+0/D+1/D+2
    const diffDays = calculateCalendarDaysDiff(item.planned_date, referenceDate);
    const isProximityWindow = diffDays >= 0 && diffDays <= 2;
    if (item.crew_id === null && isProximityWindow) {
      const conf: ScheduleConflict = {
        conflictId: `${params.boardId}__CONF-04__${item.id}__${item.planned_date}`,
        conflictCode: 'CONF-04',
        severity: 'MEDIUM',
        category: 'CREW',
        itemId: item.id,
        activityKey: item.activity_key,
        activityName: item.name,
        plannedDate: item.planned_date,
        crewId: null,
        description: `La actividad ${item.name} programada para ${item.planned_date} (ventana D+${diffDays}) no tiene cuadrilla asignada.`,
        suggestedAction: 'Asignar una cuadrilla operativa antes del inicio de jornada.',
      };
      itemConflicts.push(conf);
      allConflicts.push(conf);
    }

    const projection: ScheduleOccurrenceProjection = {
      itemId: item.id,
      weeklyPlanId: item.weekly_plan_id,
      boardId: item.board_id,
      groupId: item.group_id || null,
      activityKey: item.activity_key,
      name: item.name,
      zone: item.zone,
      unit: item.unit,
      plannedDate: item.planned_date,
      plannedQty: Number(item.planned_qty),
      theoreticalJr: Number(item.theoretical_jr),
      sourceType: item.source_type,
      routineReference: item.routine_reference,
      occurrenceKey: item.occurrence_key,
      crewId: item.crew_id || null,
      crewName,
      status: item.status,
      hasExecutions,
      totalExecutedQtyVerified,
      isRescheduled,
      overrideReason: item.override_reason || null,
      conflicts: itemConflicts,
    };

    occurrences.push(projection);

    const dateList = occurrencesByDate[item.planned_date] || [];
    dateList.push(projection);
    occurrencesByDate[item.planned_date] = dateList;

    const crewKey = item.crew_id || 'unassigned';
    const crewList = occurrencesByCrew[crewKey] || [];
    crewList.push(projection);
    occurrencesByCrew[crewKey] = crewList;
  }

  const distinctConflictsMap = new Map<string, ScheduleConflict>();
  for (const c of allConflicts) {
    distinctConflictsMap.set(c.conflictId, c);
  }
  const distinctConflicts = Array.from(distinctConflictsMap.values());

  const byCode: Record<ScheduleConflictCode, number> = {
    'CONF-01': 0,
    'CONF-02': 0,
    'CONF-03': 0,
    'CONF-04': 0,
    'CONF-05': 0,
  };
  let highCount = 0;
  let medCount = 0;
  let lowCount = 0;

  for (const c of distinctConflicts) {
    byCode[c.conflictCode] = (byCode[c.conflictCode] || 0) + 1;
    if (c.severity === 'HIGH') highCount += 1;
    else if (c.severity === 'MEDIUM') medCount += 1;
    else if (c.severity === 'LOW') lowCount += 1;
  }

  return {
    boardId: params.boardId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    referenceDate,
    evaluatedAt: params.evaluatedAt,
    totalPlannedItemsCount,
    totalPlannedJournals: Math.round(totalPlannedJournals * 100) / 100,
    conflictsSummary: {
      totalConflicts: distinctConflicts.length,
      highSeverityCount: highCount,
      mediumSeverityCount: medCount,
      lowSeverityCount: lowCount,
      byCode,
    },
    occurrences,
    occurrencesByDate,
    occurrencesByCrew,
    conflicts: distinctConflicts,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. Command Validator: Evaluación Determinista de Compuertas Séxtuples
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function validateRescheduleCommand(
  input: ReschedulePlanItemInput,
  authContext: TrustedAuthContext,
  context: RescheduleValidationContext
): RescheduleValidationResult {
  const item = context.item;
  const plan = context.plan;

  // 1. Verificación de Autorización y Tablero
  const auth = hasReschedulePermission(authContext, item.board_id);
  if (!auth.allowed) {
    return {
      allowed: false,
      action: 'REJECT',
      reasonCode: auth.reasonCode,
      message: auth.message,
      currentItem: item,
      currentPlannedDate: item.planned_date,
      targetPlannedDate: input.targetDate,
      extendedOverrideReason: null,
    };
  }

  // 2. Idempotencia: Si la fecha destino es idéntica a la actual -> NO_OP
  if (input.targetDate === item.planned_date) {
    return {
      allowed: true,
      action: 'NO_OP',
      reasonCode: 'IDEMPOTENT_NO_OP',
      message: `La actividad ya está programada para la fecha solicitada (${item.planned_date}).`,
      currentItem: item,
      currentPlannedDate: item.planned_date,
      targetPlannedDate: input.targetDate,
      extendedOverrideReason: item.override_reason || null,
    };
  }

  // 3. Compuerta de Estado del Plan (plan mutable)
  const mutablePlanStatuses = ['draft', 'published', 'in_progress'];
  if (!mutablePlanStatuses.includes(plan.status)) {
    return {
      allowed: false,
      action: 'REJECT',
      reasonCode: 'PLAN_IMMUTABLE',
      message: `El plan semanal está en estado inmutable '${plan.status}'. No se permiten reprogramaciones.`,
      currentItem: item,
      currentPlannedDate: item.planned_date,
      targetPlannedDate: input.targetDate,
      extendedOverrideReason: null,
    };
  }

  // 4. Compuerta de Ejecuciones Físicas (F5.3: 0 ejecuciones o 100% rejected)
  const nonRejectedExecutions = (context.executions || []).filter((e) => e.verification_status !== 'rejected');
  if (nonRejectedExecutions.length > 0) {
    return {
      allowed: false,
      action: 'REJECT',
      reasonCode: 'ITEM_HAS_EXECUTIONS',
      message: `El ítem posee ${nonRejectedExecutions.length} ejecución(es) física(s) activa(s). La fecha programada es inmutable.`,
      currentItem: item,
      currentPlannedDate: item.planned_date,
      targetPlannedDate: input.targetDate,
      extendedOverrideReason: null,
    };
  }

  // 5. Compuerta de Acta Emitida (ADR-0012)
  if (context.actas && context.actas.length > 0) {
    const linkedToIssued = context.actas.some(
      (a) => a.status === 'issued' && (a.items || []).some((ai) => ai.weekly_plan_item_id === item.id)
    );
    if (linkedToIssued) {
      return {
        allowed: false,
        action: 'REJECT',
        reasonCode: 'ITEM_LINKED_TO_ISSUED_ACTA',
        message: `El ítem está vinculado a un Acta emitida (#${context.actas[0]?.id || ''}). La reprogramación está bloqueada.`,
        currentItem: item,
        currentPlannedDate: item.planned_date,
        targetPlannedDate: input.targetDate,
        extendedOverrideReason: null,
      };
    }
  }

  // 6. Compuerta Intra-Semana
  if (input.targetDate < plan.week_start_date || input.targetDate > plan.week_end_date) {
    return {
      allowed: false,
      action: 'REJECT',
      reasonCode: 'DATE_OUT_OF_PLAN_BOUNDS',
      message: `La fecha destino (${input.targetDate}) cae fuera de la semana del plan (${plan.week_start_date} a ${plan.week_end_date}). H6.1 admite únicamente reprogramación intra-semana.`,
      currentItem: item,
      currentPlannedDate: item.planned_date,
      targetPlannedDate: input.targetDate,
      extendedOverrideReason: null,
    };
  }

  // 7. Compuerta de Día Hábil (Consumo soberano de routineScheduler / Ley Emiliani)
  const isTargetWorking = isOperationalWorkingDay(input.targetDate, context.customNonWorkingDays || []);
  if (!isTargetWorking) {
    return {
      allowed: false,
      action: 'REJECT',
      reasonCode: 'NON_WORKING_DAY',
      message: `La fecha solicitada (${input.targetDate}) es un día no hábil o festivo en Colombia.`,
      currentItem: item,
      currentPlannedDate: item.planned_date,
      targetPlannedDate: input.targetDate,
      extendedOverrideReason: null,
    };
  }

  // Construcción de la traza de auditoría acumulativa sin destruir el histórico existente
  const isoTimestamp = new Date().toISOString();
  const noteSnippet = input.notes ? ` note:${input.notes.trim()}` : '';
  const newAuditEntry = `[RESCHEDULE:${input.reasonCode}] prev:${item.planned_date} by:${authContext.userId} at:${isoTimestamp}${noteSnippet}`;
  const extendedOverrideReason = item.override_reason
    ? `${item.override_reason} | ${newAuditEntry}`
    : newAuditEntry;

  return {
    allowed: true,
    action: 'RESCHEDULE',
    reasonCode: 'AUTHORIZED_RESCHEDULE',
    message: `Reprogramación autorizada de ${item.planned_date} a ${input.targetDate}.`,
    currentItem: item,
    currentPlannedDate: item.planned_date,
    targetPlannedDate: input.targetDate,
    extendedOverrideReason,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. Authorized Gateway Persistence: Autoridad Final de Escritura con OCC Real
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function reschedulePlanItemValidated(
  supabase: SupabaseClient,
  input: ReschedulePlanItemInput,
  authContext: TrustedAuthContext,
  options: { customNonWorkingDays?: string[] } = {}
): Promise<ReschedulePlanItemResult> {
  // 1. Lectura del estado actual del ítem
  const { data: itemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', input.planItemId)
    .single();

  if (itemErr || !itemData) {
    throw new Error(`[H6.1 Gateway Error] Ítem no encontrado (${input.planItemId}): ${itemErr?.message || 'NULL'}`);
  }
  const item = itemData as WeeklyPlanItem;

  // 2. Lectura del estado actual del plan semanal asociado
  const { data: planData, error: planErr } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('id', item.weekly_plan_id)
    .single();

  if (planErr || !planData) {
    throw new Error(`[H6.1 Gateway Error] Plan semanal no encontrado (${item.weekly_plan_id}): ${planErr?.message || 'NULL'}`);
  }
  const plan = planData as WeeklyPlan;

  // 3. Lectura de ejecuciones activas asociadas al ítem
  const { data: execsData } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', item.id);
  const executions = (execsData || []) as ExecutionRecord[];

  // 4. Lectura de Actas emitidas vinculadas al ítem
  const { data: actasData } = await supabase
    .from('actas')
    .select('id, board_id, status, items:acta_items(weekly_plan_item_id)')
    .eq('board_id', item.board_id)
    .eq('status', 'issued');
  const actas = (actasData || []) as any[];

  // 5. Validación completa de compuertas (Doble compuerta en frontera transaccional)
  const validation = validateRescheduleCommand(input, authContext, {
    plan,
    item,
    executions,
    actas,
    customNonWorkingDays: options.customNonWorkingDays,
  });

  if (!validation.allowed) {
    throw new Error(`[H6.1 Gateway Rejection] [${validation.reasonCode}]: ${validation.message}`);
  }

  // Si es NO_OP idempotente, retornar inmediatamente sin mutar la base de datos
  if (validation.action === 'NO_OP') {
    return {
      validation,
      success: true,
      updatedItem: item,
    };
  }

  // 6. Mutación atómica con Control de Concurrencia Optimista (OCC)
  // Exige coincidencia estricta de planned_date (y updated_at si está disponible) para prevenir sobrescritura de snapshots obsoletos
  let updateQuery = supabase
    .from('weekly_plan_items')
    .update({
      planned_date: validation.targetPlannedDate,
      is_manual_override: true,
      override_reason: validation.extendedOverrideReason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.planItemId)
    .eq('planned_date', item.planned_date);

  if (item.updated_at) {
    updateQuery = updateQuery.eq('updated_at', item.updated_at);
  }

  const { data: updatedData, error: updateErr } = await updateQuery.select('*').single();

  if (updateErr || !updatedData) {
    throw new Error(
      `[H6.1 Gateway OCC Error] [CONCURRENT_MUTATION_DETECTED]: El ítem (${input.planItemId}) fue modificado o reprogramado concurrentemente por otra transacción: ${updateErr?.message || '0 filas afectadas'}`
    );
  }

  return {
    validation,
    success: true,
    updatedItem: updatedData as WeeklyPlanItem,
  };
}
