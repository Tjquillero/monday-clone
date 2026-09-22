/**
 * Service: Supervisor Executive Dashboard (Fase 5.5 / Fase 4 · Módulo 4 Compatibility)
 * Baseline Rectora de Entrada: 106 suites / 818 tests / TS 0 errores
 *
 * Principios Rectorales (v1.3.2):
 * 1. Fachada Consultiva y Read Model Puro (0 mutaciones a BD, 0 escrituras PostgREST, 0 DDL).
 * 2. Consumo unidireccional de F5.4 (realCostVarianceService) y H4.9 (operationalCapacityService).
 * 3. Invarianza de costo real: AC = UNDETERMINED_MONETARY_COST, CV = UNDETERMINED_COST_VARIANCE.
 * 4. Seguridad y Redacción RBAC integral en frontera consultiva (TrustedAuthContext).
 * 5. Evaluación temporal determinística en timezone 'America/Bogota' derivada de evaluatedAt (0 new Date() interno).
 * 6. Contrato completo de frescura (isStale) con umbral de 15m y rechazo si evaluatedAt es inválido.
 * 7. Matriz canónica de alertas (7 categorías, 9 reglas de disparo) con orden canónico determinista.
 * 8. Aislamiento total (0 imports, 0 dependencias, 0 llamadas a optimizadores externos).
 */

import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Crew, PersonnelSiteAssignment } from '@/types/crew';
import { Acta, ActaItem, ActaItemSource } from '@/types/acta';
export type UserRole = 'admin' | 'coordinator' | 'supervisor' | 'crew_leader' | 'worker' | 'director' | 'verifier' | 'viewer' | string;
import {
  evaluateSiteExecutiveVariance,
  OccurrenceVarianceAnalysis,
  CrewVarianceSummary,
  ContractualPriceSource,
  ScopeVarianceStatus,
  PhysicalEffortStatus,
  BillingReconciliationStatus,
  MonetaryStatus,
  CostVarianceStatus,
  UndeterminedContractValue,
  UndeterminedProductivity,
  UndeterminedReconciliation,
  BilledSourceBreakdown,
  round2,
} from './realCostVarianceService';
import {
  DailyCrewWorkload,
  CapacityStatus,
  calculateCrewWorkloads,
} from './operationalCapacityService';
import {
  calculateSiteResourceConsumption,
  MinimalExecutionRecord,
  SiteResourceConsumptionSummary,
  MonetaryCostStatus,
} from './resourceConsumptionControlService';

export const CONTRACTUAL_TIMEZONE = 'America/Bogota';
export const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutos

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export type ExecutiveAlertCategory =
  | 'OVER_BILLED'
  | 'CREW_OVERLOAD'
  | 'EXCESO_JORNALES'
  | 'SUBEJECUCION_ALCANCE'
  | 'PENDING_VERIFICATION'
  | 'UNDETERMINED_PRICING'
  | 'CREW_CAPACITY_UNDETERMINED';

export type ExecutiveActionHint =
  | 'REVIEW_BILLING_RECONCILIATION'
  | 'REVIEW_SCOPE_EXECUTION'
  | 'REVIEW_EFFORT_OVERRUN'
  | 'REVIEW_CREW_CAPACITY'
  | 'REVIEW_PENDING_VERIFICATION'
  | 'AUDIT_CONTRACT_PRICING';

/**
 * Contexto Confiable de Autorización (Server-Side)
 */
export interface TrustedAuthContext {
  userId: string;
  boardId: string;
  userRoles: Array<{ board_id: string; role: UserRole }>;
}

export interface OccurrenceFinancialData {
  poaUnitPrice: number | UndeterminedContractValue;
  plannedValueOccurrenceCOP: number | UndeterminedContractValue;
  earnedValueOccurrenceCOP: number | UndeterminedContractValue;
  contractualValueVarianceCOP: number | UndeterminedContractValue;
  billedQty: number | UndeterminedReconciliation;
  pendingBillableQty: number | UndeterminedReconciliation;
  overBilledQty: number | UndeterminedReconciliation;
  billingReconciliationStatus: BillingReconciliationStatus;
  billedValueCOP: number | UndeterminedContractValue | UndeterminedReconciliation;
  billedValueBreakdown: BilledSourceBreakdown[];
}

export interface ExecutiveOccurrenceAnalysis {
  planItemId: string;
  occurrenceKey: string;
  activityName: string;
  poaActivityId?: string | null;
  plannedDate: string;
  assignedCrewId?: string | null;

  // Magnitudes Físicas
  plannedQty: number;
  executedQtyReported: number;
  executedQtyVerified: number;
  contractualCertifiableQty: number;
  overExecutionQty: number;
  deltaQty: number;

  // Esfuerzo Físico
  theoreticalJr: number;
  executedJrVerified: number;
  deltaJr: number;

  // Productividad
  realProductivityRate: number | UndeterminedProductivity;
  theoreticalProductivityRate: number | UndeterminedProductivity;
  productivityIndex: number | UndeterminedProductivity;

  // Diagnósticos
  scopeStatus: ScopeVarianceStatus;
  effortStatus: PhysicalEffortStatus;

  // Bloque Financiero (null si !isFinancialViewPermitted)
  financial: OccurrenceFinancialData | null;
}

export interface DashboardExecutiveAlert {
  alertId: string; // ${boardId}__${category}__${occurrenceKey || 'global'}__${crewId || 'none'}
  category: ExecutiveAlertCategory;
  severity: AlertSeverity;
  occurrenceKey?: string | null;
  crewId?: string | null;
  title: string;
  description: string;
  actionHint: ExecutiveActionHint | null;
  details?: Record<string, unknown>; // Whitelist no financiera estricta
}

export interface FinancialExecutiveKpis {
  plannedValueCOP: number | UndeterminedContractValue;
  earnedValueCOP: number | UndeterminedContractValue;
  contractualValueVarianceCOP: number | UndeterminedContractValue;
  billedValueCOP: number | UndeterminedContractValue | UndeterminedReconciliation;
  actualCostStatus: MonetaryStatus;
  costVarianceStatus: CostVarianceStatus;
}

export interface PhysicalExecutiveKpis {
  totalOccurrencesCount: number;
  scopeComplianceRate: number;
  totalPlannedQty: number;
  totalExecutedQtyVerified: number;
  totalTheoreticalJr: number;
  totalExecutedJrVerified: number;
  overallDeltaJr: number;
  averageProductivityIndex: number | UndeterminedProductivity;
}

export interface WeeklyProgressTrendItem {
  weekStart: string; // YYYY-MM-DD (lunes)
  weekLabel: string; // ej. "Sem 15-Sep"
  totalPlannedItemsCount: number;
  verifiedCompliancePct: number;
  reportedCompliancePct: number;
  totalPlannedJr: number;
  totalVerifiedJr: number;
  status: 'COMPLETADO' | 'EN_PROGRESO' | 'SIN_EJECUCION' | 'SIN_PROGRAMACION';
}

export interface SupervisorExecutiveDashboardViewData {
  boardId: string;
  evaluatedAt: string;
  referenceDate: string; // YYYY-MM-DD en America/Bogota
  isStale: boolean;
  userRole: UserRole;
  isFinancialViewPermitted: boolean;

  // KPIs Principales
  physicalKpis: PhysicalExecutiveKpis;
  financialKpis: FinancialExecutiveKpis | null;

  // Desgloses Multidimensionales
  crews: CrewVarianceSummary[];       // Desempeño histórico F5.3 (crew_id_snapshot)
  crewWorkloads: DailyCrewWorkload[]; // Carga operativa programada H4.9
  occurrences: ExecutiveOccurrenceAnalysis[];
  weeklyTrend: WeeklyProgressTrendItem[]; // H2.1: Tendencia Semanal de Cumplimiento Verificado

  // Alertas Ejecutivas
  alerts: DashboardExecutiveAlert[];
}

export interface DashboardEvaluationOptions {
  forceUndeterminedReconciliation?: boolean;
}

/**
 * Convierte un timestamp ISO a formato YYYY-MM-DD en la zona horaria America/Bogota.
 */
export function getReferenceDateInBogota(isoString: string): string {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTRACTUAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

/**
 * Obtiene el lunes YYYY-MM-DD de la semana correspondiente a dateStr.
 */
export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().substring(0, 10);
}

/**
 * Calcula la tendencia de cumplimiento semanal de 4 semanas (H2.1).
 * Usa status de ejecucion (verified, confirmed, closed) como SoT fisico (ADR-0011).
 * Preserva unidades heterogéneas mediante porcentaje ponderado y aisla el esfuerzo en jornales.
 */
export function calculateWeeklyProgressTrend(
  planItems: WeeklyPlanItem[],
  executions: ExecutionRecord[],
  referenceDateStr: string,
  weeksCount = 4
): WeeklyProgressTrendItem[] {
  const currentMondayStr = getMondayOfWeek(referenceDateStr);
  const mondays: string[] = [];

  const curMondayObj = new Date(`${currentMondayStr}T12:00:00Z`);
  for (let i = weeksCount - 1; i >= 0; i--) {
    const mondayObj = new Date(curMondayObj);
    mondayObj.setUTCDate(mondayObj.getUTCDate() - i * 7);
    mondays.push(mondayObj.toISOString().substring(0, 10));
  }

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  return mondays.map((mondayStr) => {
    const sundayObj = new Date(`${mondayStr}T12:00:00Z`);
    sundayObj.setUTCDate(sundayObj.getUTCDate() + 6);
    const sundayStr = sundayObj.toISOString().substring(0, 10);

    const mDate = new Date(`${mondayStr}T12:00:00Z`);
    const weekLabel = `Sem ${mDate.getUTCDate()}-${monthNames[mDate.getUTCMonth()]}`;

    const weekItems = planItems.filter((i) => {
      const pDate = i.planned_date;
      return pDate >= mondayStr && pDate <= sundayStr;
    });

    const totalPlannedItemsCount = weekItems.length;

    let sumVerifiedPct = 0;
    let sumReportedPct = 0;
    let validItemsCount = 0;
    let totalPlannedJr = 0;
    let totalVerifiedJr = 0;

    for (const item of weekItems) {
      const plannedQty = item.planned_qty ?? 0;
      totalPlannedJr += item.theoretical_jr ?? 0;

      // Executions for this item (physical status column is SoT as per ADR-0011)
      const itemExecs = executions.filter((e) => {
        const itemId = e.weekly_plan_item_id || (e as any).plan_item_id;
        const matchesItem = itemId === item.id;
        const physicalStatus = (e.status || e.verification_status || '').toLowerCase();
        return matchesItem && physicalStatus !== 'rejected';
      });

      const verifiedExecs = itemExecs.filter((e) => {
        const physicalStatus = (e.status || e.verification_status || '').toLowerCase();
        return physicalStatus === 'verified' || physicalStatus === 'confirmed' || physicalStatus === 'closed';
      });

      const itemReportedQty = itemExecs.reduce((sum, e) => sum + (e.executed_qty ?? 0), 0);
      const itemVerifiedQty = verifiedExecs.reduce((sum, e) => sum + (e.executed_qty ?? 0), 0);
      const itemVerifiedJr = verifiedExecs.reduce(
        (sum, e) => sum + (e.jornales_used ?? ((e.worker_count || 1) * (e.hours_worked || 8)) / 8.0),
        0
      );

      totalVerifiedJr += itemVerifiedJr;

      if (plannedQty > 0) {
        validItemsCount++;
        const itemVerifiedPct = Math.min(100, (itemVerifiedQty / plannedQty) * 100);
        const itemReportedPct = (itemReportedQty / plannedQty) * 100;
        sumVerifiedPct += itemVerifiedPct;
        sumReportedPct += itemReportedPct;
      }
    }

    totalPlannedJr = round2(totalPlannedJr);
    totalVerifiedJr = round2(totalVerifiedJr);

    let verifiedCompliancePct = 0;
    let reportedCompliancePct = 0;

    if (validItemsCount > 0) {
      verifiedCompliancePct = round2(sumVerifiedPct / validItemsCount);
      reportedCompliancePct = round2(sumReportedPct / validItemsCount);
    }

    let status: 'COMPLETADO' | 'EN_PROGRESO' | 'SIN_EJECUCION' | 'SIN_PROGRAMACION';
    if (totalPlannedItemsCount === 0) {
      status = 'SIN_PROGRAMACION';
    } else if (verifiedCompliancePct === 0) {
      status = 'SIN_EJECUCION';
    } else if (verifiedCompliancePct >= 100) {
      status = 'COMPLETADO';
    } else {
      status = 'EN_PROGRESO';
    }

    return {
      weekStart: mondayStr,
      weekLabel,
      totalPlannedItemsCount,
      verifiedCompliancePct,
      reportedCompliancePct,
      totalPlannedJr,
      totalVerifiedJr,
      status,
    };
  });
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  INFO: 4,
};

/**
 * Fachada Consultiva Única y Determinística de Lectura Pura (Fase 5.5).
 * Genera la vista ejecutiva del dashboard para supervisores y directores.
 */
export function evaluateSupervisorExecutiveDashboardView(
  boardId: string,
  planItems: WeeklyPlanItem[],
  executions: ExecutionRecord[],
  prices: ContractualPriceSource[] = [],
  actas: Acta[] = [],
  actaItems: ActaItem[] = [],
  actaItemSources: ActaItemSource[] = [],
  crews: Crew[] = [],
  crewWorkloads: DailyCrewWorkload[] = [],
  authContext: TrustedAuthContext,
  evaluatedAt: string,
  lastSyncTimestamp?: string | null,
  options?: DashboardEvaluationOptions
): SupervisorExecutiveDashboardViewData {
  // 1. Validación estricta de evaluatedAt
  if (!evaluatedAt || typeof evaluatedAt !== 'string') {
    throw new Error('INVALID_EVALUATED_AT_TIMESTAMP');
  }
  const evaluatedAtMs = Date.parse(evaluatedAt);
  if (Number.isNaN(evaluatedAtMs)) {
    throw new Error('INVALID_EVALUATED_AT_TIMESTAMP');
  }

  // 2. Normalización de Fecha de Referencia en America/Bogota
  const referenceDate = getReferenceDateInBogota(evaluatedAt);

  // 3. Contrato de Frescura (isStale)
  let isStale = false;
  if (!lastSyncTimestamp || typeof lastSyncTimestamp !== 'string') {
    isStale = true;
  } else {
    const lastSyncMs = Date.parse(lastSyncTimestamp);
    if (Number.isNaN(lastSyncMs) || lastSyncMs > evaluatedAtMs) {
      isStale = true;
    } else if (evaluatedAtMs - lastSyncMs > STALE_THRESHOLD_MS) {
      isStale = true;
    } else {
      isStale = false;
    }
  }

  // 4. Resolución de Autorización RBAC desde TrustedAuthContext
  const matchingBoardRole = authContext.userRoles.find(
    (r) => r.board_id === authContext.boardId
  );
  const userRole: UserRole = matchingBoardRole?.role || 'worker';
  const isFinancialViewPermitted =
    authContext.boardId === boardId &&
    ['admin', 'coordinator', 'supervisor'].includes(userRole);

  // 5. Consumo Unidireccional de F5.4 (realCostVarianceService)
  const siteVariance = evaluateSiteExecutiveVariance(
    boardId,
    planItems,
    executions,
    prices,
    actas,
    actaItems,
    actaItemSources
  );

  // 6. Proyección de KPIs Físicos
  const totalPlannedQty = round2(planItems.reduce((sum, p) => sum + (p.planned_qty ?? 0), 0));
  const totalExecutedQtyVerified = round2(
    siteVariance.occurrences.reduce((sum, o) => sum + o.executedQtyVerified, 0)
  );

  let averageProductivityIndex: number | UndeterminedProductivity;
  if (siteVariance.totalTheoreticalJr <= 0 || siteVariance.totalExecutedJrVerified <= 0 || totalPlannedQty <= 0) {
    averageProductivityIndex = 'UNDETERMINED_PRODUCTIVITY';
  } else {
    const aggRealRate = totalExecutedQtyVerified / siteVariance.totalExecutedJrVerified;
    const aggTheoRate = totalPlannedQty / siteVariance.totalTheoreticalJr;
    averageProductivityIndex = round2(aggRealRate / aggTheoRate);
  }

  const physicalKpis: PhysicalExecutiveKpis = {
    totalOccurrencesCount: siteVariance.totalOccurrencesCount,
    scopeComplianceRate: siteVariance.scopeComplianceRate,
    totalPlannedQty,
    totalExecutedQtyVerified,
    totalTheoreticalJr: siteVariance.totalTheoreticalJr,
    totalExecutedJrVerified: siteVariance.totalExecutedJrVerified,
    overallDeltaJr: siteVariance.overallDeltaJr,
    averageProductivityIndex,
  };

  // 7. Proyección de KPIs Financieros (Redactados si !isFinancialViewPermitted)
  let financialKpis: FinancialExecutiveKpis | null = null;
  if (isFinancialViewPermitted) {
    financialKpis = {
      plannedValueCOP: siteVariance.totalPlannedValueCOP,
      earnedValueCOP: siteVariance.totalEarnedValueCOP,
      contractualValueVarianceCOP: siteVariance.totalContractualValueVarianceCOP,
      billedValueCOP: siteVariance.totalBilledValueCOP,
      actualCostStatus: 'UNDETERMINED_MONETARY_COST',
      costVarianceStatus: 'UNDETERMINED_COST_VARIANCE',
    };
  }

  // 8. Proyección de Ocurrencias con Redacción Financiera Estricta
  const occurrences: ExecutiveOccurrenceAnalysis[] = siteVariance.occurrences.map((occ) => {
    let financial: OccurrenceFinancialData | null = null;
    if (isFinancialViewPermitted) {
      financial = {
        poaUnitPrice: occ.poaUnitPrice,
        plannedValueOccurrenceCOP: occ.plannedValueOccurrenceCOP,
        earnedValueOccurrenceCOP: occ.earnedValueOccurrenceCOP,
        contractualValueVarianceCOP: occ.contractualValueVarianceCOP,
        billedQty: occ.billedQty,
        pendingBillableQty: occ.pendingBillableQty,
        overBilledQty: occ.overBilledQty,
        billingReconciliationStatus: occ.billingReconciliationStatus,
        billedValueCOP: occ.billedValueCOP,
        billedValueBreakdown: occ.billedValueBreakdown,
      };
    }

    return {
      planItemId: occ.planItemId,
      occurrenceKey: occ.occurrenceKey,
      activityName: occ.activityName,
      poaActivityId: occ.poaActivityId,
      plannedDate: occ.plannedDate,
      assignedCrewId: occ.assignedCrewId,
      plannedQty: occ.plannedQty,
      executedQtyReported: occ.executedQtyReported,
      executedQtyVerified: occ.executedQtyVerified,
      contractualCertifiableQty: occ.contractualCertifiableQty,
      overExecutionQty: occ.overExecutionQty,
      deltaQty: occ.deltaQty,
      theoreticalJr: occ.theoreticalJr,
      executedJrVerified: occ.executedJrVerified,
      deltaJr: occ.deltaJr,
      realProductivityRate: occ.realProductivityRate,
      theoreticalProductivityRate: occ.theoreticalProductivityRate,
      productivityIndex: occ.productivityIndex,
      scopeStatus: occ.scopeStatus,
      effortStatus: occ.effortStatus,
      financial,
    };
  });

  // 9. Matriz de Alertas Ejecutivas (7 Categorías / 9 Reglas de Disparo)
  const alertsMap = new Map<string, DashboardExecutiveAlert>();

  const executionsByOccurrence = new Map<string, ExecutionRecord[]>();
  for (const e of executions) {
    const key = (e as any).occurrence_key || e.weekly_plan_item_id;
    if (key) {
      const list = executionsByOccurrence.get(key) || [];
      list.push(e);
      executionsByOccurrence.set(key, list);
    }
  }

  for (const occ of siteVariance.occurrences) {
    // A. OVER_BILLED (Solo si isFinancialViewPermitted)
    if (isFinancialViewPermitted && occ.billingReconciliationStatus === 'OVER_BILLED') {
      const alertId = `${boardId}__OVER_BILLED__${occ.occurrenceKey}__none`;
      alertsMap.set(alertId, {
        alertId,
        category: 'OVER_BILLED',
        severity: 'CRITICAL',
        occurrenceKey: occ.occurrenceKey,
        crewId: null,
        title: 'Sobre-facturación detectada en ocurrencia',
        description: `La cantidad facturada excede lo certificable en la actividad ${occ.activityName}`,
        actionHint: 'REVIEW_BILLING_RECONCILIATION',
        details: {
          occurrenceKey: occ.occurrenceKey,
          planItemId: occ.planItemId,
          activityName: occ.activityName,
        },
      });
    }

    // B. EXCESO_JORNALES
    if (occ.effortStatus === 'EXCESO_JORNALES') {
      const alertId = `${boardId}__EXCESO_JORNALES__${occ.occurrenceKey}__${occ.assignedCrewId || 'none'}`;
      alertsMap.set(alertId, {
        alertId,
        category: 'EXCESO_JORNALES',
        severity: 'HIGH',
        occurrenceKey: occ.occurrenceKey,
        crewId: occ.assignedCrewId || null,
        title: 'Exceso de jornales en actividad',
        description: `Exceso de ${occ.deltaJr} JR en ${occ.activityName}`,
        actionHint: 'REVIEW_EFFORT_OVERRUN',
        details: {
          occurrenceKey: occ.occurrenceKey,
          planItemId: occ.planItemId,
          activityName: occ.activityName,
          deltaJr: occ.deltaJr,
          crewId: occ.assignedCrewId || null,
        },
      });
    }

    // C. SUBEJECUCION_ALCANCE
    if (occ.scopeStatus === 'SUBEJECUCION_ALCANCE') {
      const alertId = `${boardId}__SUBEJECUCION_ALCANCE__${occ.occurrenceKey}__${occ.assignedCrewId || 'none'}`;
      alertsMap.set(alertId, {
        alertId,
        category: 'SUBEJECUCION_ALCANCE',
        severity: 'HIGH',
        occurrenceKey: occ.occurrenceKey,
        crewId: occ.assignedCrewId || null,
        title: 'Subejecución de alcance físico',
        description: `Déficit de alcance en ${occ.activityName} (${occ.executedQtyVerified} / ${occ.plannedQty})`,
        actionHint: 'REVIEW_SCOPE_EXECUTION',
        details: {
          occurrenceKey: occ.occurrenceKey,
          planItemId: occ.planItemId,
          activityName: occ.activityName,
          deltaQty: occ.deltaQty,
          plannedDate: occ.plannedDate,
          crewId: occ.assignedCrewId || null,
        },
      });
    }

    // D. PENDING_VERIFICATION
    const occExecs =
      executionsByOccurrence.get(occ.occurrenceKey) ||
      executionsByOccurrence.get(occ.planItemId) ||
      [];
    const pendingExecs = occExecs.filter((e) => {
      const status = (e.verification_status || '').toLowerCase();
      return status === 'reported' || status === 'evidence_pending';
    });

    if (pendingExecs.length > 0) {
      const hasOverdue = pendingExecs.some((e) => e.execution_date < referenceDate);
      const severity: AlertSeverity = hasOverdue ? 'HIGH' : 'MEDIUM';
      const alertId = `${boardId}__PENDING_VERIFICATION__${occ.occurrenceKey}__${occ.assignedCrewId || 'none'}`;

      alertsMap.set(alertId, {
        alertId,
        category: 'PENDING_VERIFICATION',
        severity,
        occurrenceKey: occ.occurrenceKey,
        crewId: occ.assignedCrewId || null,
        title: 'Verificación de campo pendiente',
        description: `Existen ${pendingExecs.length} ejecuciones pendientes de verificación en ${occ.activityName}`,
        actionHint: 'REVIEW_PENDING_VERIFICATION',
        details: {
          occurrenceKey: occ.occurrenceKey,
          planItemId: occ.planItemId,
          activityName: occ.activityName,
          pendingExecutionsCount: pendingExecs.length,
          executionDate: pendingExecs[0]?.execution_date || occ.plannedDate,
          crewId: occ.assignedCrewId || null,
        },
      });
    }

    // E. UNDETERMINED_PRICING (Solo si isFinancialViewPermitted)
    if (isFinancialViewPermitted && occ.poaUnitPrice === 'UNDETERMINED_CONTRACT_VALUE') {
      const alertId = `${boardId}__UNDETERMINED_PRICING__${occ.occurrenceKey}__${occ.assignedCrewId || 'none'}`;
      alertsMap.set(alertId, {
        alertId,
        category: 'UNDETERMINED_PRICING',
        severity: 'INFO',
        occurrenceKey: occ.occurrenceKey,
        crewId: occ.assignedCrewId || null,
        title: 'Precio unitario contractual no determinado',
        description: `La actividad ${occ.activityName} no posee precio unitario POA vigente`,
        actionHint: 'AUDIT_CONTRACT_PRICING',
        details: {
          occurrenceKey: occ.occurrenceKey,
          planItemId: occ.planItemId,
          activityName: occ.activityName,
        },
      });
    }
  }

  for (const workload of crewWorkloads) {
    if (workload.capacityStatus === 'UNDETERMINED_CAPACITY') {
      const alertId = `${boardId}__CREW_CAPACITY_UNDETERMINED__global__${workload.crewId}`;
      alertsMap.set(alertId, {
        alertId,
        category: 'CREW_CAPACITY_UNDETERMINED',
        severity: 'INFO',
        occurrenceKey: null,
        crewId: workload.crewId,
        title: 'Capacidad indeterminada para cuadrilla',
        description: `La capacidad de ${workload.crewName} no está determinada para ${workload.plannedDate}`,
        actionHint: 'REVIEW_CREW_CAPACITY',
        details: {
          crewId: workload.crewId,
          plannedDate: workload.plannedDate,
        },
      });
    } else if (
      workload.capacityStatus === 'OVERLOADED' ||
      workload.status === 'SOBRECARGA'
    ) {
      const overloadJr = round2(
        (workload.totalPlannedJournals ?? 0) - (workload.applicableDailyCapacity ?? 0)
      );
      const severity: AlertSeverity = overloadJr > 1.0 ? 'CRITICAL' : 'HIGH';
      const alertId = `${boardId}__CREW_OVERLOAD__global__${workload.crewId}`;

      alertsMap.set(alertId, {
        alertId,
        category: 'CREW_OVERLOAD',
        severity,
        occurrenceKey: null,
        crewId: workload.crewId,
        title: 'Sobrecarga de cuadrilla detectada',
        description: `Sobrecarga de ${overloadJr} JR en cuadrilla ${workload.crewName} para ${workload.plannedDate}`,
        actionHint: 'REVIEW_CREW_CAPACITY',
        details: {
          crewId: workload.crewId,
          plannedDate: workload.plannedDate,
          overloadJr,
        },
      });
    }
  }

  const alerts = Array.from(alertsMap.values()).sort((a, b) => {
    const diffSeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (diffSeverity !== 0) return diffSeverity;
    const diffCategory = a.category.localeCompare(b.category);
    if (diffCategory !== 0) return diffCategory;
    return a.alertId.localeCompare(b.alertId);
  });

  const weeklyTrend = calculateWeeklyProgressTrend(planItems, executions, referenceDate);

  return {
    boardId,
    evaluatedAt,
    referenceDate,
    isStale,
    userRole,
    isFinancialViewPermitted,

    physicalKpis,
    financialKpis,

    crews: siteVariance.crews,
    crewWorkloads,
    occurrences,
    weeklyTrend,

    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPA DE COMPATIBILIDAD CON SUITE 44 (Fase 4 · Módulo 4)
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutiveAlertCode =
  | 'ALERT-01'
  | 'ALERT-02'
  | 'ALERT-03'
  | 'ALERT-04'
  | 'ALERT-05'
  | 'ALERT-06';

export type ExecutiveAlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface ExecutiveAlert {
  alertId: string;
  boardId: string;
  plannedDate: string;
  entityId: string;
  alertCode: ExecutiveAlertCode;
  moduleSource: 'H4.9' | 'Módulo 3';
  severity: ExecutiveAlertSeverity;
  actionPermitted: 'CONSULTIVE_ALERT';
  description: string;
  details?: Record<string, any>;
}

export interface SupervisorExecutiveDashboardSummary {
  boardId: string;
  totalPlannedItems: number;
  totalPlannedQty: number;
  totalVerifiedExecutedQty: number;
  verifiedPhysicalProgressPct: number;
  crewWorkloads: DailyCrewWorkload[];
  crewCapacityDistribution: Record<CapacityStatus, number>;
  consumptionSummary: SiteResourceConsumptionSummary;
  alerts: ExecutiveAlert[];
  monetaryCostStatus: MonetaryCostStatus;
}

export function calculateVerifiedPhysicalProgressPct(
  planItems: WeeklyPlanItem[],
  executions: MinimalExecutionRecord[]
): {
  totalPlannedQty: number;
  totalVerifiedExecutedQty: number;
  progressPct: number;
} {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2Num = (n: number) => Math.round(n * 100) / 100;

  const validExecutions = executions.filter((e) => {
    const isVerified =
      e.verification_status === 'VERIFIED' ||
      e.status === 'confirmed' ||
      e.status === 'completed';
    return isVerified;
  });

  let totalPlannedQty = 0;
  let totalVerifiedExecutedQty = 0;

  for (const item of planItems) {
    const plannedQty = item.planned_qty ?? 0;
    if (plannedQty <= 0) continue;

    totalPlannedQty += plannedQty;

    const matchedExecs = validExecutions.filter((e) => {
      if (item.occurrence_key || e.occurrence_key) {
        return item.occurrence_key === e.occurrence_key;
      }
      return e.weekly_plan_item_id === item.id;
    });

    const execQty = matchedExecs.reduce((sum, e) => sum + (e.executed_qty ?? 0), 0);
    totalVerifiedExecutedQty += execQty;
  }

  totalPlannedQty = round2Num(totalPlannedQty);
  totalVerifiedExecutedQty = round2Num(totalVerifiedExecutedQty);

  let progressPct = 0.0;
  if (totalPlannedQty > 0) {
    progressPct = round1((totalVerifiedExecutedQty / totalPlannedQty) * 100);
  }

  return {
    totalPlannedQty,
    totalVerifiedExecutedQty,
    progressPct,
  };
}

export function generateExecutiveAlerts(params: {
  boardId: string;
  crewWorkloads: DailyCrewWorkload[];
  consumptionSummary: SiteResourceConsumptionSummary;
  allCrews?: Crew[];
  allCrewMembersMap?: Map<string, string[]>;
  allSiteAssignmentsMap?: Map<string, PersonnelSiteAssignment>;
}): ExecutiveAlert[] {
  const alerts: ExecutiveAlert[] = [];

  for (const cw of params.crewWorkloads) {
    if (cw.capacityStatus === 'OVERLOADED' || cw.status === 'SOBRECARGA') {
      alerts.push({
        alertId: `${params.boardId}__${cw.plannedDate}__${cw.crewId}__ALERT-01`,
        boardId: params.boardId,
        plannedDate: cw.plannedDate,
        entityId: cw.crewId,
        alertCode: 'ALERT-01',
        moduleSource: 'H4.9',
        severity: 'CRITICAL',
        actionPermitted: 'CONSULTIVE_ALERT',
        description: `Sobrecarga de demanda en cuadrilla ${cw.crewName}`,
      });
    }

    if (cw.capacityStatus === 'CAPACITY_ZERO') {
      alerts.push({
        alertId: `${params.boardId}__${cw.plannedDate}__${cw.crewId}__ALERT-02`,
        boardId: params.boardId,
        plannedDate: cw.plannedDate,
        entityId: cw.crewId,
        alertCode: 'ALERT-02',
        moduleSource: 'H4.9',
        severity: 'CRITICAL',
        actionPermitted: 'CONSULTIVE_ALERT',
        description: `Demanda asignada en día con Capacidad Cero para ${cw.crewName}`,
      });
    }

    if (cw.calendarStatus === 'NON_WORKING_DAY') {
      for (const item of cw.items) {
        alerts.push({
          alertId: `${params.boardId}__${cw.plannedDate}__${item.id}__ALERT-03`,
          boardId: params.boardId,
          plannedDate: cw.plannedDate,
          entityId: item.id,
          alertCode: 'ALERT-03',
          moduleSource: 'H4.9',
          severity: 'HIGH',
          actionPermitted: 'CONSULTIVE_ALERT',
          description: `Actividad programada en día no laborable F3.1: ${item.activityName}`,
        });
      }
    }
  }

  for (const item of params.consumptionSummary.items) {
    if (item.consumptionStatus === 'EXCESO_CONSUMO_JR') {
      alerts.push({
        alertId: `${params.boardId}__${item.plannedDate}__${item.occurrenceKey}__ALERT-04`,
        boardId: params.boardId,
        plannedDate: item.plannedDate,
        entityId: item.occurrenceKey,
        alertCode: 'ALERT-04',
        moduleSource: 'Módulo 3',
        severity: 'HIGH',
        actionPermitted: 'CONSULTIVE_ALERT',
        description: `Exceso de consumo de jornales verificado (+${item.deltaJr} JR) en ${item.activityName}`,
      });
    }

    if (item.consumptionStatus === 'SUBEJECUCION_ALCANCE') {
      alerts.push({
        alertId: `${params.boardId}__${item.plannedDate}__${item.occurrenceKey}__ALERT-05`,
        boardId: params.boardId,
        plannedDate: item.plannedDate,
        entityId: item.occurrenceKey,
        alertCode: 'ALERT-05',
        moduleSource: 'Módulo 3',
        severity: 'MEDIUM',
        actionPermitted: 'CONSULTIVE_ALERT',
        description: `Subejecución física de alcance en ${item.activityName}`,
      });
    }
  }

  if (params.allCrewMembersMap) {
    const personUsage = new Map<string, string[]>();
    for (const [crewId, memberIds] of params.allCrewMembersMap.entries()) {
      for (const memberId of memberIds) {
        const list = personUsage.get(memberId) || [];
        list.push(crewId);
        personUsage.set(memberId, list);
      }
    }

    for (const [memberId, crewList] of personUsage.entries()) {
      if (crewList.length > 1) {
        for (const crewId of crewList) {
          alerts.push({
            alertId: `${params.boardId}__global__${crewId}__ALERT-06`,
            boardId: params.boardId,
            plannedDate: 'global',
            entityId: crewId,
            alertCode: 'ALERT-06',
            moduleSource: 'H4.9',
            severity: 'MEDIUM',
            actionPermitted: 'CONSULTIVE_ALERT',
            description: `Personal compartido adscrito a múltiples cuadrillas activas`,
          });
        }
      }
    }
  }

  const distinctAlerts = new Map<string, ExecutiveAlert>();
  for (const a of alerts) {
    distinctAlerts.set(a.alertId, a);
  }
  return Array.from(distinctAlerts.values());
}

export function buildSupervisorExecutiveDashboard(params: {
  boardId: string;
  planItems: WeeklyPlanItem[];
  executions: MinimalExecutionRecord[];
  crews?: Crew[];
  dailyCapacityByCrew?: Record<string, number>;
  crewMembersMap?: Map<string, Array<{ personnel_assignment_id: string }>>;
  allCrews?: Crew[];
  allCrewMembersMap?: Map<string, string[]>;
  allSiteAssignmentsMap?: Map<string, PersonnelSiteAssignment>;
}): SupervisorExecutiveDashboardSummary {
  const boardItems = params.planItems.filter((i) => i.board_id === params.boardId);

  const progressMetrics = calculateVerifiedPhysicalProgressPct(boardItems, params.executions);

  const crewWorkloads = calculateCrewWorkloads(
    boardItems,
    params.crews || [],
    params.dailyCapacityByCrew
  );

  const initialCapacityCounts: Record<CapacityStatus, number> = {
    NON_WORKING_NO_DEMAND: 0,
    INVALID_WORKING_CALENDAR_DAY: 0,
    NO_DEMAND: 0,
    NO_CAPACITY_NO_DEMAND: 0,
    UNDETERMINED_CAPACITY: 0,
    CAPACITY_ZERO: 0,
    OVERLOADED: 0,
    UNDERUTILIZED: 0,
    BALANCED: 0,
  };

  const crewCapacityDistribution = crewWorkloads.reduce((acc, cw) => {
    const status = cw.capacityStatus || (cw.status === 'SOBRECARGA' ? 'OVERLOADED' : 'BALANCED');
    if (acc[status] !== undefined) {
      acc[status] = (acc[status] || 0) + 1;
    }
    return acc;
  }, initialCapacityCounts);

  const consumptionSummary = calculateSiteResourceConsumption(boardItems, params.executions);

  const alerts = generateExecutiveAlerts({
    boardId: params.boardId,
    crewWorkloads,
    consumptionSummary,
    allCrews: params.allCrews,
    allCrewMembersMap: params.allCrewMembersMap,
    allSiteAssignmentsMap: params.allSiteAssignmentsMap,
  });

  return {
    boardId: params.boardId,
    totalPlannedItems: boardItems.length,
    totalPlannedQty: progressMetrics.totalPlannedQty,
    totalVerifiedExecutedQty: progressMetrics.totalVerifiedExecutedQty,
    verifiedPhysicalProgressPct: progressMetrics.progressPct,
    crewWorkloads,
    crewCapacityDistribution,
    consumptionSummary,
    alerts,
    monetaryCostStatus: 'UNDETERMINED_MONETARY_COST',
  };
}
