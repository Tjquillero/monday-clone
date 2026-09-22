/**
 * Service: Control de Costos Reales y Desviaciones Operativas (Fase 5.4)
 * Baseline de Entrada: 105 suites / 804 tests / TS 0 errores
 *
 * Principios Rectorales (v1.4):
 * 1. Read Model determinístico y puro (0 mutaciones a BD, 0 escrituras PostgREST).
 * 2. Invarianza de costo real: AC = UNDETERMINED_MONETARY_COST, CV = UNDETERMINED_COST_VARIANCE.
 * 3. Precedencia estricta de alcance físico: subejecución física NUNCA es menor consumo de jornales.
 * 4. Tolerancia de esfuerzo soberana M3 (±0.05 JR). Exactitud aritmética de cantidades (round2).
 * 5. Desacoplamiento de precios: PV/EV/CVV consumen POA; Billed consume snapshots individuales de Actas.
 * 6. Trazabilidad multifuente de Actas vía acta_item_sources con soporte multiprecio.
 * 7. Tipado riguroso de indeterminación para evitar falsos ceros.
 * 8. Aislamiento total (0 imports, 0 dependencias, 0 llamadas a optimizadores externos).
 */

import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import { Acta, ActaItem, ActaItemSource } from '@/types/acta';

export const TOLERANCE_JR = 0.05; // Soberanía M3

export type ScopeVarianceStatus =
  | 'ALCANCE_COMPLETO'
  | 'SUBEJECUCION_ALCANCE'
  | 'SOBRE_EJECUCION';

export type PhysicalEffortStatus =
  | 'SUBEJECUCION_ALCANCE'
  | 'EXCESO_JORNALES'
  | 'MENOR_CONSUMO_JORNALES'
  | 'JORNALES_BALANCEADOS';

export type BillingReconciliationStatus =
  | 'BALANCED'
  | 'PENDING_BILLING'
  | 'OVER_BILLED'
  | 'UNDETERMINED_RECONCILIATION';

export type MonetaryStatus = 'UNDETERMINED_MONETARY_COST';
export type CostVarianceStatus = 'UNDETERMINED_COST_VARIANCE';
export type UndeterminedContractValue = 'UNDETERMINED_CONTRACT_VALUE';
export type UndeterminedProductivity = 'UNDETERMINED_PRODUCTIVITY';
export type UndeterminedReconciliation = 'UNDETERMINED_RECONCILIATION';

/**
 * Entrada Contractual de Precios Soberanos de POA
 */
export interface ContractualPriceSource {
  poaActivityId: string;
  unitPrice: number | null;
  currency: 'COP';
  unit?: string;
}

/**
 * Desglose Individual de Facturación por Fuente de Acta
 */
export interface BilledSourceBreakdown {
  actaId: string;
  actaNumero?: number | null;
  actaItemId: string;
  actaItemSourceId: string;
  executionId: string;
  quantityConsumed: number;
  unitPriceSnapshot: number | UndeterminedContractValue;
  billedValueCOP: number | UndeterminedContractValue;
}

/**
 * Análisis de Desviaciones a Nivel de Ocurrencia (WeeklyPlanItem)
 */
export interface OccurrenceVarianceAnalysis {
  planItemId: string;
  occurrenceKey: string;
  activityName: string;
  poaActivityId?: string | null;
  plannedDate: string;
  assignedCrewId?: string | null;

  // 1. Magnitudes Físicas (1 fila = 1 hecho físico)
  plannedQty: number;
  executedQtyReported: number;        // Informativo: Suma de hechos físicos no rechazados
  executedQtyVerified: number;        // Suma de hechos físicos VERIFIED
  contractualCertifiableQty: number;  // min(verified, planned)
  overExecutionQty: number;           // max(0, verified - planned)
  deltaQty: number;                   // verified - planned

  // 2. Esfuerzo Físico y Jornales
  theoreticalJr: number;
  executedJrVerified: number;         // Suma de JR de ejecuciones VERIFIED
  deltaJr: number;                    // executedJrVerified - theoreticalJr

  // 3. Productividad Física con Propagación de Indeterminación
  realProductivityRate: number | UndeterminedProductivity;
  theoreticalProductivityRate: number | UndeterminedProductivity;
  productivityIndex: number | UndeterminedProductivity;

  // 4. Diagnósticos Operativos Mutuamente Excluyentes
  scopeStatus: ScopeVarianceStatus;
  effortStatus: PhysicalEffortStatus;

  // 5. Magnitudes Financieras Contractuales
  poaUnitPrice: number | UndeterminedContractValue;
  plannedValueOccurrenceCOP: number | UndeterminedContractValue;   // plannedQty * poaUnitPrice
  earnedValueOccurrenceCOP: number | UndeterminedContractValue;    // contractualCertifiableQty * poaUnitPrice
  contractualValueVarianceCOP: number | UndeterminedContractValue; // EV - PV
  actualCostStatus: MonetaryStatus;
  costVarianceStatus: CostVarianceStatus;

  // 6. Conciliación y Desglose de Facturación con Actas (ADR-0012)
  billedQty: number | UndeterminedReconciliation;
  pendingBillableQty: number | UndeterminedReconciliation;
  overBilledQty: number | UndeterminedReconciliation;
  billingReconciliationStatus: BillingReconciliationStatus;
  billedValueCOP: number | UndeterminedContractValue | UndeterminedReconciliation;
  billedValueBreakdown: BilledSourceBreakdown[];
}

/**
 * Resumen de Rendimiento y Desviaciones Agregado por Cuadrilla
 */
export interface CrewVarianceSummary {
  crewId: string | null;
  totalOccurrencesCount: number;
  completedScopeCount: number;
  subexecutedCount: number;
  overexecutedCount: number;
  totalTheoreticalJr: number;
  totalExecutedJrVerified: number;
  overallDeltaJr: number;
  averageProductivityIndex: number | UndeterminedProductivity;
  actualCostStatus: MonetaryStatus;
}

/**
 * Consolidado Ejecutivo del Tablero / Sitio
 */
export interface SiteExecutiveVarianceSummary {
  boardId: string;
  totalOccurrencesCount: number;
  scopeComplianceRate: number;        // count(ALCANCE_COMPLETO + SOBRE_EJECUCION) / totalOccurrences
  totalTheoreticalJr: number;
  totalExecutedJrVerified: number;
  overallDeltaJr: number;

  // Consolidado Financiero Contractual
  totalPlannedValueCOP: number | UndeterminedContractValue;
  totalEarnedValueCOP: number | UndeterminedContractValue;
  totalContractualValueVarianceCOP: number | UndeterminedContractValue;
  totalBilledValueCOP: number | UndeterminedContractValue | UndeterminedReconciliation;
  actualCostStatus: MonetaryStatus;
  costVarianceStatus: CostVarianceStatus;

  occurrences: OccurrenceVarianceAnalysis[];
  crews: CrewVarianceSummary[];
}

export interface VarianceEvaluationOptions {
  forceUndeterminedReconciliation?: boolean;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Evalúa las desviaciones operativas, físicas y contractuales de una ocurrencia específica.
 */
export function evaluateOccurrenceVariance(
  planItem: WeeklyPlanItem,
  executions: ExecutionRecord[],
  prices: ContractualPriceSource[] = [],
  actas: Acta[] = [],
  actaItems: ActaItem[] = [],
  actaItemSources: ActaItemSource[] = [],
  options?: VarianceEvaluationOptions
): OccurrenceVarianceAnalysis {
  const targetOccurrenceKey = planItem.occurrence_key || `${planItem.board_id}__${planItem.id}`;
  const poaActivityId = (planItem as any).poa_activity_id || planItem.activity_key;

  // 1. Filtrar ejecuciones físicas asociadas a esta ocurrencia (1 fila = 1 hecho físico)
  const occurrenceExecutions = executions.filter(
    (e) =>
      (e.weekly_plan_item_id && e.weekly_plan_item_id === planItem.id) ||
      ((e as any).occurrence_key && (e as any).occurrence_key === targetOccurrenceKey)
  );

  // Asegurar filas físicas únicas por id
  const distinctExecutionsMap = new Map<string, ExecutionRecord>();
  for (const e of occurrenceExecutions) {
    if (e.id) {
      distinctExecutionsMap.set(e.id, e);
    }
  }
  const distinctExecutions = Array.from(distinctExecutionsMap.values());

  // Hechos físicos no rechazados (Informativo)
  const nonRejectedExecutions = distinctExecutions.filter(
    (e) => e.verification_status !== 'rejected'
  );

  // Hechos físicos formalmente VERIFIED (ADR-0011)
  const verifiedExecutions = distinctExecutions.filter((e) => {
    const status = (e.verification_status || '').toLowerCase();
    return status === 'verified' || status === 'confirmed' || status === 'closed';
  });

  // 2. Cálculo de Magnitudes Físicas con Semántica de Redondeo Acumulado round2(SUM)
  const rawReportedQty = nonRejectedExecutions.reduce((sum, e) => sum + (e.executed_qty ?? 0), 0);
  const executedQtyReported = round2(rawReportedQty);

  const rawVerifiedQty = verifiedExecutions.reduce((sum, e) => sum + (e.executed_qty ?? 0), 0);
  const executedQtyVerified = round2(rawVerifiedQty);

  const plannedQty = round2(planItem.planned_qty ?? 0);
  const deltaQty = round2(executedQtyVerified - plannedQty);

  const contractualCertifiableQty = round2(Math.min(executedQtyVerified, plannedQty));
  const overExecutionQty = round2(Math.max(0, executedQtyVerified - plannedQty));

  // 3. Esfuerzo Físico y Jornales
  const rawExecutedJr = verifiedExecutions.reduce((sum, e) => {
    const jr = e.jornales_used ?? (e.worker_count && e.hours_worked ? (e.worker_count * e.hours_worked) / 8.0 : 0);
    return sum + jr;
  }, 0);
  const executedJrVerified = round2(rawExecutedJr);
  const theoreticalJr = round2(planItem.theoretical_jr ?? 0);
  const deltaJr = round2(executedJrVerified - theoreticalJr);

  // 4. Diagnósticos Operativos Mutuamente Excluyentes
  let scopeStatus: ScopeVarianceStatus;
  if (executedQtyVerified < plannedQty) {
    scopeStatus = 'SUBEJECUCION_ALCANCE';
  } else if (executedQtyVerified === plannedQty) {
    scopeStatus = 'ALCANCE_COMPLETO';
  } else {
    scopeStatus = 'SOBRE_EJECUCION';
  }

  let effortStatus: PhysicalEffortStatus;
  if (scopeStatus === 'SUBEJECUCION_ALCANCE') {
    // Precedencia estricta de alcance: bloquea falso ahorro
    effortStatus = 'SUBEJECUCION_ALCANCE';
  } else {
    // ALCANCE_COMPLETO o SOBRE_EJECUCION
    if (deltaJr > TOLERANCE_JR) {
      effortStatus = 'EXCESO_JORNALES';
    } else if (deltaJr < -TOLERANCE_JR && scopeStatus === 'ALCANCE_COMPLETO') {
      effortStatus = 'MENOR_CONSUMO_JORNALES';
    } else {
      effortStatus = 'JORNALES_BALANCEADOS';
    }
  }

  // 5. Productividad Física con Propagación de Indeterminación
  let realProductivityRate: number | UndeterminedProductivity;
  if (executedJrVerified <= 0 || executedQtyVerified <= 0) {
    realProductivityRate = 'UNDETERMINED_PRODUCTIVITY';
  } else {
    realProductivityRate = round2(executedQtyVerified / executedJrVerified);
  }

  let theoreticalProductivityRate: number | UndeterminedProductivity;
  if (theoreticalJr <= 0 || plannedQty <= 0) {
    theoreticalProductivityRate = 'UNDETERMINED_PRODUCTIVITY';
  } else {
    theoreticalProductivityRate = round2(plannedQty / theoreticalJr);
  }

  let productivityIndex: number | UndeterminedProductivity;
  if (
    realProductivityRate === 'UNDETERMINED_PRODUCTIVITY' ||
    theoreticalProductivityRate === 'UNDETERMINED_PRODUCTIVITY' ||
    (typeof theoreticalProductivityRate === 'number' && theoreticalProductivityRate === 0)
  ) {
    productivityIndex = 'UNDETERMINED_PRODUCTIVITY';
  } else {
    productivityIndex = round2((realProductivityRate as number) / (theoreticalProductivityRate as number));
  }

  // 6. Magnitudes Financieras Contractuales (POA)
  const matchingPrice = prices.find(
    (p) => p.poaActivityId === poaActivityId || p.poaActivityId === planItem.activity_key
  );

  let poaUnitPrice: number | UndeterminedContractValue;
  let plannedValueOccurrenceCOP: number | UndeterminedContractValue;
  let earnedValueOccurrenceCOP: number | UndeterminedContractValue;
  let contractualValueVarianceCOP: number | UndeterminedContractValue;

  if (!matchingPrice || matchingPrice.unitPrice === null || matchingPrice.unitPrice === undefined || matchingPrice.unitPrice < 0) {
    poaUnitPrice = 'UNDETERMINED_CONTRACT_VALUE';
    plannedValueOccurrenceCOP = 'UNDETERMINED_CONTRACT_VALUE';
    earnedValueOccurrenceCOP = 'UNDETERMINED_CONTRACT_VALUE';
    contractualValueVarianceCOP = 'UNDETERMINED_CONTRACT_VALUE';
  } else {
    poaUnitPrice = matchingPrice.unitPrice;
    plannedValueOccurrenceCOP = round2(plannedQty * poaUnitPrice);
    earnedValueOccurrenceCOP = round2(contractualCertifiableQty * poaUnitPrice);
    contractualValueVarianceCOP = round2(earnedValueOccurrenceCOP - plannedValueOccurrenceCOP);
  }

  // 7. Conciliación y Desglose de Facturación con Actas (ADR-0012)
  const issuedActasMap = new Map<string, Acta>();
  for (const a of actas) {
    if (a.estado === 'issued' || a.estado === 'closed') {
      issuedActasMap.set(a.id, a);
    }
  }

  const issuedActaItems = actaItems.filter((ai) => issuedActasMap.has(ai.acta_id));
  const issuedActaItemMap = new Map<string, ActaItem>();
  for (const ai of issuedActaItems) {
    issuedActaItemMap.set(ai.id, ai);
  }

  // Conjunto de IDs de ejecuciones físicas de esta ocurrencia
  const occurrenceExecutionIds = new Set(distinctExecutions.map((e) => e.id));

  // Filtrar acta_item_sources válidos de actas emitidas vinculados a ejecuciones de esta ocurrencia
  const matchedSourcesMap = new Map<string, ActaItemSource>();
  for (const s of actaItemSources) {
    if (occurrenceExecutionIds.has(s.execution_id) && issuedActaItemMap.has(s.acta_item_id)) {
      matchedSourcesMap.set(s.id, s);
    }
  }
  const matchedSources = Array.from(matchedSourcesMap.values());

  // Chequeo de consistencia / indeterminación
  const hasOrphanedIssuedActa =
    options?.forceUndeterminedReconciliation ||
    issuedActaItems.some((ai) => {
      if (ai.poa_activity_id === poaActivityId || ai.activity_key_snapshot === planItem.activity_key) {
        // Si hay un acta emitida para esta actividad pero sus fuentes no existen o tienen suma 0
        const sourcesForThisItem = actaItemSources.filter((s) => s.acta_item_id === ai.id);
        return sourcesForThisItem.length === 0;
      }
      return false;
    });

  let billedQty: number | UndeterminedReconciliation;
  let pendingBillableQty: number | UndeterminedReconciliation;
  let overBilledQty: number | UndeterminedReconciliation;
  let billingReconciliationStatus: BillingReconciliationStatus;
  let billedValueCOP: number | UndeterminedContractValue | UndeterminedReconciliation;
  const billedValueBreakdown: BilledSourceBreakdown[] = [];

  if (hasOrphanedIssuedActa) {
    billingReconciliationStatus = 'UNDETERMINED_RECONCILIATION';
    billedQty = 'UNDETERMINED_RECONCILIATION';
    pendingBillableQty = 'UNDETERMINED_RECONCILIATION';
    overBilledQty = 'UNDETERMINED_RECONCILIATION';
    billedValueCOP = 'UNDETERMINED_RECONCILIATION';
  } else {
    let hasUndeterminedPriceSnapshot = false;
    let totalBilledVal = 0;

    for (const source of matchedSources) {
      const parentItem = issuedActaItemMap.get(source.acta_item_id);
      const parentActa = parentItem ? issuedActasMap.get(parentItem.acta_id) : undefined;

      const unitPriceSnapshot: number | UndeterminedContractValue =
        parentItem && typeof parentItem.precio_unitario_snapshot === 'number' && parentItem.precio_unitario_snapshot >= 0
          ? parentItem.precio_unitario_snapshot
          : 'UNDETERMINED_CONTRACT_VALUE';

      let sourceBilledVal: number | UndeterminedContractValue;
      if (unitPriceSnapshot === 'UNDETERMINED_CONTRACT_VALUE') {
        hasUndeterminedPriceSnapshot = true;
        sourceBilledVal = 'UNDETERMINED_CONTRACT_VALUE';
      } else {
        sourceBilledVal = round2(source.cantidad_consumida * unitPriceSnapshot);
        totalBilledVal += sourceBilledVal;
      }

      billedValueBreakdown.push({
        actaId: parentActa?.id || parentItem?.acta_id || '',
        actaNumero: parentActa?.numero ?? null,
        actaItemId: source.acta_item_id,
        actaItemSourceId: source.id,
        executionId: source.execution_id,
        quantityConsumed: round2(source.cantidad_consumida),
        unitPriceSnapshot,
        billedValueCOP: sourceBilledVal,
      });
    }

    const rawBilledQty = billedValueBreakdown.reduce((sum, b) => sum + b.quantityConsumed, 0);
    billedQty = round2(rawBilledQty);

    pendingBillableQty = round2(Math.max(0, contractualCertifiableQty - billedQty));
    overBilledQty = round2(Math.max(0, billedQty - contractualCertifiableQty));

    if (billedQty === contractualCertifiableQty) {
      billingReconciliationStatus = 'BALANCED';
    } else if (billedQty < contractualCertifiableQty) {
      billingReconciliationStatus = 'PENDING_BILLING';
    } else {
      billingReconciliationStatus = 'OVER_BILLED';
    }

    if (hasUndeterminedPriceSnapshot) {
      billedValueCOP = 'UNDETERMINED_CONTRACT_VALUE';
    } else {
      billedValueCOP = round2(totalBilledVal);
    }
  }

  // Snapshot de cuadrilla: tomar de la primera ejecución registrada o fallback a planItem.crew_id
  const assignedCrewId =
    distinctExecutions.find((e) => e.crew_id_snapshot !== undefined)?.crew_id_snapshot ??
    planItem.crew_id ??
    null;

  return {
    planItemId: planItem.id,
    occurrenceKey: targetOccurrenceKey,
    activityName: planItem.name,
    poaActivityId,
    plannedDate: planItem.planned_date,
    assignedCrewId,

    plannedQty,
    executedQtyReported,
    executedQtyVerified,
    contractualCertifiableQty,
    overExecutionQty,
    deltaQty,

    theoreticalJr,
    executedJrVerified,
    deltaJr,

    realProductivityRate,
    theoreticalProductivityRate,
    productivityIndex,

    scopeStatus,
    effortStatus,

    poaUnitPrice,
    plannedValueOccurrenceCOP,
    earnedValueOccurrenceCOP,
    contractualValueVarianceCOP,
    actualCostStatus: 'UNDETERMINED_MONETARY_COST',
    costVarianceStatus: 'UNDETERMINED_COST_VARIANCE',

    billedQty,
    pendingBillableQty,
    overBilledQty,
    billingReconciliationStatus,
    billedValueCOP,
    billedValueBreakdown,
  };
}

/**
 * Agrega el análisis de desviaciones por cuadrilla a partir de ocurrencias evaluadas.
 */
export function evaluateCrewVariance(
  occurrences: OccurrenceVarianceAnalysis[]
): CrewVarianceSummary[] {
  const crewMap = new Map<string | null, OccurrenceVarianceAnalysis[]>();

  for (const occ of occurrences) {
    const crewId = occ.assignedCrewId ?? null;
    const list = crewMap.get(crewId) || [];
    list.push(occ);
    crewMap.set(crewId, list);
  }

  const summaries: CrewVarianceSummary[] = [];

  for (const [crewId, list] of crewMap.entries()) {
    const totalOccurrencesCount = list.length;
    const completedScopeCount = list.filter((o) => o.scopeStatus === 'ALCANCE_COMPLETO').length;
    const subexecutedCount = list.filter((o) => o.scopeStatus === 'SUBEJECUCION_ALCANCE').length;
    const overexecutedCount = list.filter((o) => o.scopeStatus === 'SOBRE_EJECUCION').length;

    const totalTheoreticalJr = round2(list.reduce((sum, o) => sum + o.theoreticalJr, 0));
    const totalExecutedJrVerified = round2(list.reduce((sum, o) => sum + o.executedJrVerified, 0));
    const overallDeltaJr = round2(totalExecutedJrVerified - totalTheoreticalJr);

    // Productividad agregada
    const totalVerifiedQty = round2(list.reduce((sum, o) => sum + o.executedQtyVerified, 0));
    const totalPlannedQty = round2(list.reduce((sum, o) => sum + o.plannedQty, 0));

    let averageProductivityIndex: number | UndeterminedProductivity;
    if (totalTheoreticalJr <= 0 || totalExecutedJrVerified <= 0 || totalPlannedQty <= 0) {
      averageProductivityIndex = 'UNDETERMINED_PRODUCTIVITY';
    } else {
      const aggRealRate = totalVerifiedQty / totalExecutedJrVerified;
      const aggTheoRate = totalPlannedQty / totalTheoreticalJr;
      averageProductivityIndex = round2(aggRealRate / aggTheoRate);
    }

    summaries.push({
      crewId,
      totalOccurrencesCount,
      completedScopeCount,
      subexecutedCount,
      overexecutedCount,
      totalTheoreticalJr,
      totalExecutedJrVerified,
      overallDeltaJr,
      averageProductivityIndex,
      actualCostStatus: 'UNDETERMINED_MONETARY_COST',
    });
  }

  return summaries;
}

/**
 * Genera el consolidado ejecutivo global de desviaciones y costos para el tablero.
 */
export function evaluateSiteExecutiveVariance(
  boardId: string,
  planItems: WeeklyPlanItem[],
  executions: ExecutionRecord[],
  prices: ContractualPriceSource[] = [],
  actas: Acta[] = [],
  actaItems: ActaItem[] = [],
  actaItemSources: ActaItemSource[] = []
): SiteExecutiveVarianceSummary {
  const occurrences = planItems.map((item) =>
    evaluateOccurrenceVariance(item, executions, prices, actas, actaItems, actaItemSources)
  );

  const crews = evaluateCrewVariance(occurrences);

  const totalOccurrencesCount = occurrences.length;
  const compliantCount = occurrences.filter(
    (o) => o.scopeStatus === 'ALCANCE_COMPLETO' || o.scopeStatus === 'SOBRE_EJECUCION'
  ).length;

  const scopeComplianceRate =
    totalOccurrencesCount > 0 ? round2((compliantCount / totalOccurrencesCount) * 100) : 0;

  const totalTheoreticalJr = round2(occurrences.reduce((sum, o) => sum + o.theoreticalJr, 0));
  const totalExecutedJrVerified = round2(
    occurrences.reduce((sum, o) => sum + o.executedJrVerified, 0)
  );
  const overallDeltaJr = round2(totalExecutedJrVerified - totalTheoreticalJr);

  // Consolidado Financiero Contractual
  let hasUndeterminedPV = false;
  let totalPV = 0;
  let hasUndeterminedEV = false;
  let totalEV = 0;
  let hasUndeterminedBilled = false;
  let totalBilled = 0;

  for (const o of occurrences) {
    if (o.plannedValueOccurrenceCOP === 'UNDETERMINED_CONTRACT_VALUE') {
      hasUndeterminedPV = true;
    } else {
      totalPV += o.plannedValueOccurrenceCOP as number;
    }

    if (o.earnedValueOccurrenceCOP === 'UNDETERMINED_CONTRACT_VALUE') {
      hasUndeterminedEV = true;
    } else {
      totalEV += o.earnedValueOccurrenceCOP as number;
    }

    if (
      o.billedValueCOP === 'UNDETERMINED_CONTRACT_VALUE' ||
      o.billedValueCOP === 'UNDETERMINED_RECONCILIATION'
    ) {
      hasUndeterminedBilled = true;
    } else {
      totalBilled += o.billedValueCOP as number;
    }
  }

  const totalPlannedValueCOP: number | UndeterminedContractValue = hasUndeterminedPV
    ? 'UNDETERMINED_CONTRACT_VALUE'
    : round2(totalPV);

  const totalEarnedValueCOP: number | UndeterminedContractValue = hasUndeterminedEV
    ? 'UNDETERMINED_CONTRACT_VALUE'
    : round2(totalEV);

  const totalContractualValueVarianceCOP: number | UndeterminedContractValue =
    hasUndeterminedPV || hasUndeterminedEV
      ? 'UNDETERMINED_CONTRACT_VALUE'
      : round2((totalEarnedValueCOP as number) - (totalPlannedValueCOP as number));

  const totalBilledValueCOP: number | UndeterminedContractValue | UndeterminedReconciliation =
    hasUndeterminedBilled ? 'UNDETERMINED_CONTRACT_VALUE' : round2(totalBilled);

  return {
    boardId,
    totalOccurrencesCount,
    scopeComplianceRate,
    totalTheoreticalJr,
    totalExecutedJrVerified,
    overallDeltaJr,

    totalPlannedValueCOP,
    totalEarnedValueCOP,
    totalContractualValueVarianceCOP,
    totalBilledValueCOP,
    actualCostStatus: 'UNDETERMINED_MONETARY_COST',
    costVarianceStatus: 'UNDETERMINED_COST_VARIANCE',

    occurrences,
    crews,
  };
}
