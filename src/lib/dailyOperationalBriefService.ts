/**
 * Service: Daily Operational Brief (DOB) Read Model Engine
 * 
 * Principios e Invariantes:
 * 1. Read Model determinístico y puro (0 mutaciones a BD, 0 DDL adicional).
 * 2. Calendario Laboral Colombiano Soberano: Consumo exclusivo de isOperationalWorkingDay (ADR-0007 / Ley Emiliani).
 * 3. Invarianza de Cantidades Reales: Las cantidades son hechos observados derivados de ExecutionRecord[].
 * 4. Distinción reported vs verified: Solo verified/confirmed/closed constituyen avance formal.
 * 5. Aislamiento total del Solver H8 (🔴 STRICTLY NO-GO).
 */

import { WeeklyPlanItem } from '../types/weeklyPlan';
import { ExecutionRecord, DailyActivityStatus, calculateExecutionMetrics } from '../types/execution';
import { isOperationalWorkingDay } from './routineScheduler';
import { OperationalResourceItem } from './resourceConsumptionControlService';

export interface ExecutionAttachmentRecord {
  id: string;
  execution_id: string;
  file_url: string;
  file_name: string;
  phase?: 'before' | 'after' | null;
  created_at?: string;
}

export interface CrewMemberSnapshot {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

export interface DailyActivityCard {
  weeklyPlanItemId: string;
  taskName: string;
  activityKey?: string;
  plannedQty: number;
  unit: string;
  crewId?: string | null;
  dailyStatus: DailyActivityStatus;
  
  // Métricas acumuladas y del día
  previouslyExecutedQty: number;
  dailyExecutedQty: number;
  totalReportedQty: number;
  verifiedQty: number;
  remainingPlannedQty: number;
  plannedQuantitySatisfied: boolean;

  // Proyección temporal (Día N de M)
  dayProgressLabel: string; // ej: 'Día 2 de 3'
  isContinued: boolean;     // true si previouslyExecutedQty > 0 y no finalizada
  
  // Evidencias del día
  hasBeforePhoto: boolean;
  hasAfterPhoto: boolean;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;

  // Recursos utilizados hoy
  dailyResources: OperationalResourceItem[];
}

export interface DailyClosureSummary {
  evaluationDate: string;
  totalActivitiesScheduled: number;
  completedTodayCount: number;
  continuedTomorrowCount: number;
  notExecutedCount: number;
  inProgressCount: number;
  
  totalHoursWorkedToday: number;
  totalJornalesUsedToday: number;
  
  // Balance de recursos utilizados en la jornada
  consolidatedResources: OperationalResourceItem[];
}

export interface DailyOperationalBrief {
  evaluationDate: string;
  boardId: string;
  crewId: string;
  
  // Tarjetas de actividad para la vista HOY
  activities: DailyActivityCard[];
  
  // Resumen del turno / Cierre Diario
  closureSummary: DailyClosureSummary;
}

export interface DailyBriefEvaluationInput {
  evaluationDate: string; // YYYY-MM-DD
  boardId: string;
  crewId: string;
  weeklyPlanItems: WeeklyPlanItem[];
  executionRecords: ExecutionRecord[];
  attachments?: ExecutionAttachmentRecord[];
  crewMembers?: CrewMemberSnapshot[];
  customNonWorkingDays?: string[];
  activityDatesMap?: Record<string, { startDate: string; endDate: string }>;
}

/**
 * Calcula la etiqueta 'Día N de M' usando el calendario laboral soberano (isOperationalWorkingDay)
 */
export function calculateOperationalDayProgress(
  startDateStr: string,
  endDateStr: string,
  evaluationDateStr: string,
  customNonWorkingDays: string[] = []
): { label: string; currentDay: number; totalDays: number } {
  let totalDays = 0;
  let currentDay = 0;

  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  const evalDate = new Date(`${evaluationDateStr}T00:00:00Z`);

  let cursor = new Date(start);
  while (cursor <= end) {
    const cursorStr = cursor.toISOString().substring(0, 10);
    if (isOperationalWorkingDay(cursorStr, customNonWorkingDays)) {
      totalDays++;
      if (cursor <= evalDate) {
        currentDay++;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Fallback si start == end y no hubo días laborables
  totalDays = Math.max(1, totalDays);
  currentDay = Math.max(1, currentDay);

  return {
    label: `Día ${currentDay} de ${totalDays}`,
    currentDay,
    totalDays,
  };
}

/**
 * Evalúa el Daily Operational Brief (DOB) completo para una fecha y cuadrilla dadas.
 */
export function evaluateDailyOperationalBrief(
  input: DailyBriefEvaluationInput
): DailyOperationalBrief {
  const {
    evaluationDate,
    boardId,
    crewId,
    weeklyPlanItems = [],
    executionRecords = [],
    attachments = [],
    customNonWorkingDays = [],
    activityDatesMap = {},
  } = input;

  // Filtrar ítems asignados a la cuadrilla o generales del tablero
  const assignedItems = weeklyPlanItems.filter(
    (item) => !crewId || !item.crew_id || item.crew_id === crewId
  );

  const activities: DailyActivityCard[] = [];
  let totalHoursWorkedToday = 0;
  let totalJornalesUsedToday = 0;
  const consolidatedResourcesMap = new Map<string, OperationalResourceItem>();

  for (const item of assignedItems) {
    // 1. Filtrar ejecuciones históricas y de hoy para este ítem
    const itemExecs = executionRecords.filter(
      (e) => e.weekly_plan_item_id === item.id && e.verification_status !== 'rejected'
    );

    const prevExecs = itemExecs.filter((e) => e.execution_date < evaluationDate);
    const todayExecs = itemExecs.filter((e) => e.execution_date === evaluationDate);

    const previouslyExecutedQty = prevExecs.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);
    const dailyExecutedQty = todayExecs.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

    const metrics = calculateExecutionMetrics(item.planned_qty, itemExecs);
    const totalReportedQty = metrics.totalReportedQty;
    const verifiedQty = metrics.certifiableExecutedQty;
    const remainingPlannedQty = metrics.remainingPlannedQty;
    const plannedQuantitySatisfied = totalReportedQty >= item.planned_qty;

    // 2. Determinar estado de jornada diaria (DailyActivityStatus)
    let dailyStatus: DailyActivityStatus = 'PENDIENTE';

    if (item.status === 'completed') {
      dailyStatus = todayExecs.length > 0 ? 'TERMINADA_HOY' : 'TERMINADA_HOY';
    } else if (todayExecs.length > 0) {
      // Si se ejecutó hoy pero el ítem padre sigue in_progress
      dailyStatus = 'CONTINUA_MANANA';
    } else if (item.status === 'in_progress') {
      dailyStatus = previouslyExecutedQty > 0 ? 'PENDIENTE' : 'PENDIENTE';
    }

    // 3. Evidencias del día
    const todayExecIds = new Set(todayExecs.map((e) => e.id));
    const todayAttachments = attachments.filter((a) => todayExecIds.has(a.execution_id));
    
    const beforePhoto = todayAttachments.find((a) => a.phase === 'before');
    const afterPhoto = todayAttachments.find((a) => a.phase === 'after');

    // 4. Recursos del día
    const dailyResources: OperationalResourceItem[] = [];
    for (const exec of todayExecs) {
      if (exec.used_resources && Array.isArray(exec.used_resources)) {
        for (const res of exec.used_resources) {
          dailyResources.push(res);
          
          // Consolidación para el Cierre Diario
          const mapKey = `${res.resourceKey}_${res.unit}`;
          const existing = consolidatedResourcesMap.get(mapKey);
          if (existing) {
            existing.quantity += res.quantity;
          } else {
            consolidatedResourcesMap.set(mapKey, { ...res });
          }
        }
      }
      totalHoursWorkedToday += exec.hours_worked || 0;
      totalJornalesUsedToday += exec.jornales_used || ((exec.worker_count || 1) * (exec.hours_worked || 8)) / 8.0;
    }

    // 5. Cálculo temporal de Día N de M
    const dates = activityDatesMap[item.id] || {
      startDate: item.planned_date || evaluationDate,
      endDate: item.planned_date || evaluationDate,
    };

    const dayProgress = calculateOperationalDayProgress(
      dates.startDate,
      dates.endDate,
      evaluationDate,
      customNonWorkingDays
    );

    const isContinued = previouslyExecutedQty > 0 && item.status !== 'completed';

    activities.push({
      weeklyPlanItemId: item.id,
      taskName: item.name,
      activityKey: item.activity_key,
      plannedQty: item.planned_qty,
      unit: item.unit,
      crewId: item.crew_id,
      dailyStatus,
      previouslyExecutedQty,
      dailyExecutedQty,
      totalReportedQty,
      verifiedQty,
      remainingPlannedQty,
      plannedQuantitySatisfied,
      dayProgressLabel: dayProgress.label,
      isContinued,
      hasBeforePhoto: Boolean(beforePhoto),
      hasAfterPhoto: Boolean(afterPhoto),
      beforePhotoUrl: beforePhoto?.file_url,
      afterPhotoUrl: afterPhoto?.file_url,
      dailyResources,
    });
  }

  // 6. Resumen de Cierre Diario
  const completedTodayCount = activities.filter((a) => a.dailyStatus === 'TERMINADA_HOY').length;
  const continuedTomorrowCount = activities.filter((a) => a.dailyStatus === 'CONTINUA_MANANA').length;
  const notExecutedCount = activities.filter((a) => a.dailyStatus === 'NO_EJECUTADA' || (a.dailyStatus === 'PENDIENTE' && a.dailyExecutedQty === 0)).length;
  const inProgressCount = activities.filter((a) => a.dailyStatus === 'EN_CURSO').length;

  const closureSummary: DailyClosureSummary = {
    evaluationDate,
    totalActivitiesScheduled: activities.length,
    completedTodayCount,
    continuedTomorrowCount,
    notExecutedCount,
    inProgressCount,
    totalHoursWorkedToday,
    totalJornalesUsedToday,
    consolidatedResources: Array.from(consolidatedResourcesMap.values()),
  };

  return {
    evaluationDate,
    boardId,
    crewId,
    activities,
    closureSummary,
  };
}
