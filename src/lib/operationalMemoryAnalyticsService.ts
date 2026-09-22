/**
 * Service: Operational Memory & Observability Analytics (v1)
 *
 * Naturaleza:
 * Read Model / Servicio Analítico Consultivo Determinista y de Solo Lectura.
 *
 * Axiomas Rectorales:
 * 1. HECHO != MÉTRICA != PATRÓN != RECOMENDACIÓN != DECISIÓN != RESULTADO.
 * 2. Cero persistencia, Cero DDL, Cero mutaciones a fuentes de verdad existentes.
 * 3. Aislamiento total de Solver H8 (🔴 STRICTLY NO-GO).
 * 4. Contratos matemáticos cerrados con propagación estricta de indeterminación.
 * 5. Evaluación de suficiencia estadística: N < minSampleSize -> INSUFFICIENT_EVIDENCE.
 */

import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';
import {
  AnalyticsScope,
  MetricValueStatus,
  SufficiencyStatus,
  OperationalMetricKey,
  OperationalMetricResult,
  OperationalPatternKey,
  PatternThresholdConfig,
  OperationalPatternResult,
  OperationalMemoryAnalyticsInput,
  OperationalMemoryAnalyticsResult,
} from '@/types/operationalMemory';
import { round2 } from './realCostVarianceService';

// ─────────────────────────────────────────────────────────────────────────────
// Configuraciones y Umbrales por Defecto
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PATTERN_CONFIG: PatternThresholdConfig = {
  minSampleSize: 3,
  underestimationIpThreshold: 0.85,
  underestimationPrevalenceThreshold: 0.75,
  crewDispersionCvThreshold: 0.25,
  resourceVarianceDeltaRatioThreshold: 0.15,
  multidayDragThresholdDays: 2,
  multidayPrevalenceThreshold: 0.70,
  verificationPendingRateThreshold: 0.40,
  verificationLeadTimeHoursThreshold: 72,
  rescheduleCountThreshold: 2,
};

export interface RescheduleOccurrenceFact {
  occurrence_key: string;
  reschedule_count: number;
  last_override_reason?: string | null;
}

export interface OperationalFactsPayload {
  planItems: WeeklyPlanItem[];
  executions: ExecutionRecord[];
  reschedules?: RescheduleOccurrenceFact[];
  requiredResourcesMap?: Record<string, { resourceKey: string; resourceName?: string; category?: string; unit?: string; quantity: number }[]>;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Calculador Puro de Métricas Deterministas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula las 10 métricas deterministas sobre un conjunto de hechos filtrados.
 */
export function computeOperationalMetrics(
  scope: AnalyticsScope,
  planItems: WeeklyPlanItem[],
  executions: ExecutionRecord[],
  reschedules: RescheduleOccurrenceFact[] = [],
  requiredResourcesMap: Record<string, { resourceKey: string; quantity: number }[]> = {}
): OperationalMetricResult[] {
  const results: OperationalMetricResult[] = [];

  // Filtrar ejecuciones físicas asociadas al scope
  const activeExecutions = executions.filter((e) => e.verification_status !== 'rejected');
  const verifiedExecutions = activeExecutions.filter((e) => {
    const st = (e.verification_status || '').toLowerCase();
    return st === 'verified' || st === 'confirmed' || st === 'closed';
  });
  const rejectedExecutions = executions.filter((e) => e.verification_status === 'rejected');

  // Sumas de magnitudes físicas
  const totalPlannedQty = round2(planItems.reduce((acc, curr) => acc + (curr.planned_qty || 0), 0));
  const totalTheoreticalJr = round2(planItems.reduce((acc, curr) => acc + (curr.theoretical_jr || 0), 0));
  const totalVerifiedQty = round2(verifiedExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0));
  const totalReportedQty = round2(activeExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0));

  const totalVerifiedJr = round2(
    verifiedExecutions.reduce((acc, curr) => {
      const jr = curr.jornales_used ?? (curr.worker_count && curr.hours_worked ? (curr.worker_count * curr.hours_worked) / 8.0 : 0);
      return acc + jr;
    }, 0)
  );

  const sampleSizeExecutions = verifiedExecutions.length;

  // 1. METRIC_THEORETICAL_PRODUCTIVITY_RATE (R_teo)
  let theoreticalRate: number | null = null;
  let theoreticalRateStatus: MetricValueStatus = 'DETERMINED';
  if (totalTheoreticalJr <= 0) {
    theoreticalRateStatus = 'UNDETERMINED_ZERO_EFFORT';
  } else if (totalPlannedQty <= 0) {
    theoreticalRateStatus = 'UNDETERMINED_ZERO_QUANTITY';
  } else {
    theoreticalRate = round4(totalPlannedQty / totalTheoreticalJr);
  }

  results.push({
    metricKey: 'METRIC_THEORETICAL_PRODUCTIVITY_RATE',
    scope,
    value: theoreticalRate,
    unit: 'unidad/JR',
    valueStatus: theoreticalRateStatus,
    sufficiencyStatus: planItems.length > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: planItems.length,
    calculationTrace: {
      formula: 'totalPlannedQty / totalTheoreticalJr',
      inputs: { totalPlannedQty, totalTheoreticalJr },
    },
  });

  // 2. METRIC_PRODUCTIVITY_RATE (R_real)
  let realRate: number | null = null;
  let realRateStatus: MetricValueStatus = 'DETERMINED';
  if (verifiedExecutions.length === 0) {
    realRateStatus = 'UNDETERMINED_UNVERIFIED_DATA';
  } else if (totalVerifiedJr <= 0) {
    realRateStatus = 'UNDETERMINED_ZERO_EFFORT';
  } else if (totalVerifiedQty <= 0) {
    realRateStatus = 'UNDETERMINED_ZERO_QUANTITY';
  } else {
    realRate = round4(totalVerifiedQty / totalVerifiedJr);
  }

  results.push({
    metricKey: 'METRIC_PRODUCTIVITY_RATE',
    scope,
    value: realRate,
    unit: 'unidad/JR',
    valueStatus: realRateStatus,
    sufficiencyStatus: sampleSizeExecutions > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: sampleSizeExecutions,
    calculationTrace: {
      formula: 'totalVerifiedQty / totalVerifiedJr',
      inputs: { totalVerifiedQty, totalVerifiedJr },
    },
  });

  // 3. METRIC_PRODUCTIVITY_INDEX (IP)
  let ipValue: number | null = null;
  let ipStatus: MetricValueStatus = 'DETERMINED';
  if (realRate === null || theoreticalRate === null || theoreticalRate <= 0) {
    ipStatus = realRateStatus !== 'DETERMINED' ? realRateStatus : theoreticalRateStatus;
  } else {
    ipValue = round4(realRate / theoreticalRate);
  }

  results.push({
    metricKey: 'METRIC_PRODUCTIVITY_INDEX',
    scope,
    value: ipValue,
    unit: 'ratio',
    valueStatus: ipStatus,
    sufficiencyStatus: (sampleSizeExecutions > 0 && planItems.length > 0) ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: sampleSizeExecutions,
    calculationTrace: {
      formula: 'R_real / R_teo',
      inputs: { realRate, theoreticalRate },
    },
  });

  // 4. METRIC_EFFORT_VARIANCE_JR (Delta JR)
  let deltaJrValue: number | null = null;
  let deltaJrStatus: MetricValueStatus = 'DETERMINED';
  if (verifiedExecutions.length === 0 && planItems.length === 0) {
    deltaJrStatus = 'UNDETERMINED_UNVERIFIED_DATA';
  } else {
    deltaJrValue = round2(totalVerifiedJr - totalTheoreticalJr);
  }

  results.push({
    metricKey: 'METRIC_EFFORT_VARIANCE_JR',
    scope,
    value: deltaJrValue,
    unit: 'JR',
    valueStatus: deltaJrStatus,
    sufficiencyStatus: sampleSizeExecutions > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: sampleSizeExecutions,
    calculationTrace: {
      formula: 'totalVerifiedJr - totalTheoreticalJr',
      inputs: { totalVerifiedJr, totalTheoreticalJr },
    },
  });

  // 5. METRIC_MULTIDAY_DURATION_DAYS
  // Días distintos de calendario con ejecución física
  const executionDates = Array.from(new Set(activeExecutions.map((e) => e.execution_date).filter(Boolean)));
  const durationDays = executionDates.length;

  results.push({
    metricKey: 'METRIC_MULTIDAY_DURATION_DAYS',
    scope,
    value: durationDays,
    unit: 'días',
    valueStatus: 'DETERMINED',
    sufficiencyStatus: durationDays > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: activeExecutions.length,
    calculationTrace: {
      formula: 'count(distinct execution_date)',
      inputs: { distinctDatesCount: durationDays, dates: executionDates.join(', ') },
    },
  });

  // 6. METRIC_DAILY_EXECUTION_INTENSITY (Promedio worker_count * hours_worked / días)
  let avgWorkers = 0;
  let avgHours = 0;
  if (activeExecutions.length > 0) {
    avgWorkers = round2(activeExecutions.reduce((acc, curr) => acc + (curr.worker_count || 0), 0) / activeExecutions.length);
    avgHours = round2(activeExecutions.reduce((acc, curr) => acc + (curr.hours_worked || 0), 0) / activeExecutions.length);
  }

  results.push({
    metricKey: 'METRIC_DAILY_EXECUTION_INTENSITY',
    scope,
    value: avgWorkers,
    unit: 'operarios/jornada',
    valueStatus: activeExecutions.length > 0 ? 'DETERMINED' : 'UNDETERMINED_UNVERIFIED_DATA',
    sufficiencyStatus: activeExecutions.length > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: activeExecutions.length,
    calculationTrace: {
      formula: 'sum(worker_count) / count(executions)',
      inputs: { avgWorkers, avgHours, executionsCount: activeExecutions.length },
    },
  });

  // 7 & 8. RECURSOS OBSERVADOS (POD-01)
  const allUsedResources = activeExecutions.flatMap((e) => e.used_resources || []);
  const totalResourceQtyUsed = round2(allUsedResources.reduce((acc, curr) => acc + (curr.quantity || 0), 0));

  let consumptionRatio: number | null = null;
  let consumptionRatioStatus: MetricValueStatus = 'DETERMINED';
  if (totalVerifiedQty <= 0) {
    consumptionRatioStatus = 'UNDETERMINED_ZERO_QUANTITY';
  } else if (allUsedResources.length === 0) {
    consumptionRatio = 0;
  } else {
    consumptionRatio = round4(totalResourceQtyUsed / totalVerifiedQty);
  }

  results.push({
    metricKey: 'METRIC_RESOURCE_CONSUMPTION_RATIO',
    scope,
    value: consumptionRatio,
    unit: 'recurso_total/unidad_obra',
    valueStatus: consumptionRatioStatus,
    sufficiencyStatus: (allUsedResources.length > 0 && totalVerifiedQty > 0) ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: allUsedResources.length,
    calculationTrace: {
      formula: 'totalResourceQtyUsed / totalVerifiedQty',
      inputs: { totalResourceQtyUsed, totalVerifiedQty },
    },
  });

  // Delta recurso vs planificado
  let totalRequiredResourceQty = 0;
  for (const item of planItems) {
    const reqs = requiredResourcesMap[item.id] || requiredResourcesMap[item.occurrence_key] || [];
    for (const r of reqs) {
      totalRequiredResourceQty += r.quantity || 0;
    }
  }
  totalRequiredResourceQty = round2(totalRequiredResourceQty);
  const resourceVarianceDelta = round2(totalResourceQtyUsed - totalRequiredResourceQty);

  results.push({
    metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA',
    scope,
    value: resourceVarianceDelta,
    unit: 'magnitud_recurso',
    valueStatus: 'DETERMINED',
    sufficiencyStatus: (allUsedResources.length > 0 || totalRequiredResourceQty > 0) ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: allUsedResources.length,
    calculationTrace: {
      formula: 'totalResourceQtyUsed - totalRequiredResourceQty',
      inputs: { totalResourceQtyUsed, totalRequiredResourceQty },
    },
  });

  // 9. METRIC_VERIFICATION_LEAD_TIME_HOURS
  // Promedio de horas entre created_at/execution_date y verified_at
  const verifiedWithTimestamps = verifiedExecutions.filter((e) => e.verified_at && (e.created_at || e.execution_date));
  let avgLeadTimeHours: number | null = null;
  if (verifiedWithTimestamps.length > 0) {
    const totalHours = verifiedWithTimestamps.reduce((acc, curr) => {
      const startMs = new Date(curr.created_at || `${curr.execution_date}T00:00:00Z`).getTime();
      const endMs = new Date(curr.verified_at!).getTime();
      const diffHours = Math.max(0, (endMs - startMs) / (1000 * 60 * 60));
      return acc + diffHours;
    }, 0);
    avgLeadTimeHours = round2(totalHours / verifiedWithTimestamps.length);
  }

  results.push({
    metricKey: 'METRIC_VERIFICATION_LEAD_TIME_HOURS',
    scope,
    value: avgLeadTimeHours,
    unit: 'horas',
    valueStatus: avgLeadTimeHours !== null ? 'DETERMINED' : 'UNDETERMINED_UNVERIFIED_DATA',
    sufficiencyStatus: verifiedWithTimestamps.length > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: verifiedWithTimestamps.length,
    calculationTrace: {
      formula: 'avg(verified_at - created_at) in hours',
      inputs: { avgLeadTimeHours, verifiedWithTimestampsCount: verifiedWithTimestamps.length },
    },
  });

  // 10. METRIC_VERIFICATION_REJECTION_RATE
  const totalReportedExecutionsCount = executions.length;
  let rejectionRate: number | null = null;
  if (totalReportedExecutionsCount > 0) {
    rejectionRate = round4(rejectedExecutions.length / totalReportedExecutionsCount);
  }

  results.push({
    metricKey: 'METRIC_VERIFICATION_REJECTION_RATE',
    scope,
    value: rejectionRate,
    unit: 'ratio',
    valueStatus: rejectionRate !== null ? 'DETERMINED' : 'UNDETERMINED_UNVERIFIED_DATA',
    sufficiencyStatus: totalReportedExecutionsCount > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: totalReportedExecutionsCount,
    calculationTrace: {
      formula: 'rejectedCount / totalReportedCount',
      inputs: { rejectedCount: rejectedExecutions.length, totalReportedCount: totalReportedExecutionsCount },
    },
  });

  // 11. METRIC_RESCHEDULE_OCCURRENCE_COUNT
  let totalReschedules = 0;
  if (reschedules.length > 0) {
    totalReschedules = reschedules.reduce((acc, curr) => acc + (curr.reschedule_count || 0), 0);
  }

  results.push({
    metricKey: 'METRIC_RESCHEDULE_OCCURRENCE_COUNT',
    scope,
    value: totalReschedules,
    unit: 'conteo',
    valueStatus: 'DETERMINED',
    sufficiencyStatus: reschedules.length > 0 ? 'SUFFICIENT_EVIDENCE' : 'NO_DATA',
    sampleSize: reschedules.length,
    calculationTrace: {
      formula: 'sum(reschedule_count)',
      inputs: { totalReschedules, occurrencesRescheduled: reschedules.length },
    },
  });

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Detectores Deterministas de Patrones v1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evalúa los 6 patrones canónicos aplicando compuertas estadísticas explícitas.
 */
export function detectOperationalPatterns(
  scope: AnalyticsScope,
  metrics: OperationalMetricResult[],
  planItems: WeeklyPlanItem[],
  executions: ExecutionRecord[],
  reschedules: RescheduleOccurrenceFact[] = [],
  configOverrides?: Partial<PatternThresholdConfig>
): OperationalPatternResult[] {
  const config: PatternThresholdConfig = {
    ...DEFAULT_PATTERN_CONFIG,
    ...configOverrides,
  };

  const patterns: OperationalPatternResult[] = [];

  // Indexar métricas por llave para consulta rápida
  const metricsMap = new Map<OperationalMetricKey, OperationalMetricResult>();
  for (const m of metrics) {
    metricsMap.set(m.metricKey, m);
  }

  const verifiedExecutions = executions.filter((e) => {
    const st = (e.verification_status || '').toLowerCase();
    return st === 'verified' || st === 'confirmed' || st === 'closed';
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P-01: SYSTEMATIC_UNDERESTIMATION
  // Regla: IP < threshold (0.85) en >= prevalence (75%) de las ocurrencias con N >= minSampleSize
  // ───────────────────────────────────────────────────────────────────────────
  const underestimationIpTh = config.underestimationIpThreshold ?? 0.85;
  const underestimationPrevTh = config.underestimationPrevalenceThreshold ?? 0.75;
  const minN = config.minSampleSize;

  const ipMetric = metricsMap.get('METRIC_PRODUCTIVITY_INDEX');
  const occurrencesWithExecutions = planItems.filter((item) =>
    verifiedExecutions.some((e) => e.weekly_plan_item_id === item.id || (e as any).occurrence_key === item.occurrence_key)
  );
  const sampleSizeUnderestimation = occurrencesWithExecutions.length;

  let p01Status: OperationalPatternResult['detectionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let p01AnomalousCount = 0;
  let p01Prevalence = 0;

  if (sampleSizeUnderestimation < minN) {
    p01Status = 'INSUFFICIENT_EVIDENCE';
  } else {
    // Evaluar cada ocurrencia individual
    for (const item of occurrencesWithExecutions) {
      const itemExecs = verifiedExecutions.filter(
        (e) => e.weekly_plan_item_id === item.id || (e as any).occurrence_key === item.occurrence_key
      );
      const vQty = itemExecs.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);
      const vJr = itemExecs.reduce(
        (acc, curr) => acc + (curr.jornales_used ?? (curr.worker_count && curr.hours_worked ? (curr.worker_count * curr.hours_worked) / 8.0 : 0)),
        0
      );
      const pQty = item.planned_qty || 0;
      const tJr = item.theoretical_jr || 0;

      if (vJr > 0 && tJr > 0 && pQty > 0) {
        const itemRReal = vQty / vJr;
        const itemRTeo = pQty / tJr;
        const itemIp = itemRReal / itemRTeo;
        if (itemIp < underestimationIpTh) {
          p01AnomalousCount++;
        }
      }
    }

    p01Prevalence = sampleSizeUnderestimation > 0 ? p01AnomalousCount / sampleSizeUnderestimation : 0;
    p01Status = p01Prevalence >= underestimationPrevTh ? 'PATTERN_DETECTED' : 'PATTERN_NOT_DETECTED';
  }

  patterns.push({
    patternKey: 'P-01_SYSTEMATIC_UNDERESTIMATION',
    scope,
    detectionStatus: p01Status,
    sampleSize: sampleSizeUnderestimation,
    minRequiredSampleSize: minN,
    confidenceScore: sampleSizeUnderestimation >= minN ? round2(Math.min(1.0, sampleSizeUnderestimation / (minN * 2))) : 0,
    thresholdsApplied: {
      underestimationIpThreshold: underestimationIpTh,
      underestimationPrevalenceThreshold: underestimationPrevTh,
      minSampleSize: minN,
    },
    supportingMetricKeys: ['METRIC_PRODUCTIVITY_INDEX', 'METRIC_EFFORT_VARIANCE_JR'],
    empiricalEvidence: {
      summary: p01Status === 'PATTERN_DETECTED'
        ? `Se detectó subestimación sistemática de esfuerzo: ${p01AnomalousCount} de ${sampleSizeUnderestimation} ocurrencias (${round2(p01Prevalence * 100)}%) presentaron IP < ${underestimationIpTh}.`
        : p01Status === 'INSUFFICIENT_EVIDENCE'
        ? `Evidencia insuficiente: se evaluaron ${sampleSizeUnderestimation} ocurrencias (mínimo requerido ${minN}).`
        : `No se detectó subestimación sistemática: solo ${p01AnomalousCount} de ${sampleSizeUnderestimation} ocurrencias presentaron IP bajo.`,
      factsEvaluatedCount: sampleSizeUnderestimation,
      anomalousFactsCount: p01AnomalousCount,
      prevalenceRatio: round4(p01Prevalence),
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P-02: CREW_PERFORMANCE_DISPERSION
  // Regla: Dispersión de IP entre cuadrillas > cvThreshold (0.25) con >= 2 cuadrillas y >= minN ejecuciones c/u
  // ───────────────────────────────────────────────────────────────────────────
  const dispersionCvTh = config.crewDispersionCvThreshold ?? 0.25;
  const crewGroups = new Map<string, ExecutionRecord[]>();

  for (const e of verifiedExecutions) {
    const crewId = e.crew_id_snapshot || (e as any).assigned_crew_id || 'unassigned';
    if (!crewGroups.has(crewId)) {
      crewGroups.set(crewId, []);
    }
    crewGroups.get(crewId)!.push(e);
  }

  const validCrewsWithSample = Array.from(crewGroups.entries()).filter(([_, execs]) => execs.length >= minN);
  let p02Status: OperationalPatternResult['detectionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let p02Prevalence = 0;
  let p02Summary = '';

  if (validCrewsWithSample.length < 2) {
    p02Status = 'INSUFFICIENT_EVIDENCE';
    p02Summary = `Evidencia insuficiente para dispersión: se requieren al menos 2 cuadrillas con >= ${minN} ejecuciones cada una (encontradas: ${validCrewsWithSample.length}).`;
  } else {
    // Calcular productividad promedio por cuadrilla
    const crewProductivities: number[] = [];
    for (const [_, cExecs] of validCrewsWithSample) {
      const cQty = cExecs.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);
      const cJr = cExecs.reduce((acc, curr) => acc + (curr.jornales_used ?? ((curr.worker_count * curr.hours_worked) / 8.0)), 0);
      if (cJr > 0) {
        crewProductivities.push(cQty / cJr);
      }
    }

    if (crewProductivities.length >= 2) {
      const mean = crewProductivities.reduce((a, b) => a + b, 0) / crewProductivities.length;
      const variance = crewProductivities.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / crewProductivities.length;
      const stdDev = Math.sqrt(variance);
      const cv = mean > 0 ? stdDev / mean : 0;

      p02Prevalence = round4(cv);
      p02Status = cv >= dispersionCvTh ? 'PATTERN_DETECTED' : 'PATTERN_NOT_DETECTED';
      p02Summary = p02Status === 'PATTERN_DETECTED'
        ? `Dispersión significativa de rendimiento entre cuadrillas detectada (Coeficiente de Variación = ${round2(cv * 100)}% >= ${round2(dispersionCvTh * 100)}%).`
        : `Rendimiento homogéneo entre cuadrillas (Coeficiente de Variación = ${round2(cv * 100)}% < ${round2(dispersionCvTh * 100)}%).`;
    } else {
      p02Status = 'INSUFFICIENT_EVIDENCE';
      p02Summary = 'Datos insuficientes para calcular productividad comparativa.';
    }
  }

  patterns.push({
    patternKey: 'P-02_CREW_PERFORMANCE_DISPERSION',
    scope,
    detectionStatus: p02Status,
    sampleSize: validCrewsWithSample.length,
    minRequiredSampleSize: 2,
    confidenceScore: validCrewsWithSample.length >= 2 ? round2(Math.min(1.0, validCrewsWithSample.length / 4)) : 0,
    thresholdsApplied: {
      crewDispersionCvThreshold: dispersionCvTh,
      minSampleSizePerCrew: minN,
    },
    supportingMetricKeys: ['METRIC_PRODUCTIVITY_RATE'],
    empiricalEvidence: {
      summary: p02Summary,
      factsEvaluatedCount: validCrewsWithSample.length,
      anomalousFactsCount: p02Status === 'PATTERN_DETECTED' ? validCrewsWithSample.length : 0,
      prevalenceRatio: p02Prevalence,
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P-03: RESOURCE_CONSUMPTION_ANOMALY
  // Regla: deltaRatio > threshold (0.15) de exceso de consumo o uso de no planificados
  // ───────────────────────────────────────────────────────────────────────────
  const resDeltaMetric = metricsMap.get('METRIC_RESOURCE_VARIANCE_DELTA');
  const resRatioTh = config.resourceVarianceDeltaRatioThreshold ?? 0.15;
  const allUsedRes = executions.flatMap((e) => e.used_resources || []);

  let p03Status: OperationalPatternResult['detectionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let p03AnomalousCount = 0;
  let p03Summary = '';

  if (allUsedRes.length < minN) {
    p03Status = 'INSUFFICIENT_EVIDENCE';
    p03Summary = `Muestra insuficiente de consumos de recursos observados (${allUsedRes.length} < ${minN}).`;
  } else {
    // Agrupar por resourceKey y verificar desviaciones
    const resourceUsageMap = new Map<string, number>();
    for (const r of allUsedRes) {
      resourceUsageMap.set(r.resourceKey, (resourceUsageMap.get(r.resourceKey) || 0) + r.quantity);
    }

    const anomalousKeys: string[] = [];
    for (const [key, qty] of resourceUsageMap.entries()) {
      if (qty > 0 && resDeltaMetric && resDeltaMetric.value !== null && resDeltaMetric.value > 0) {
        anomalousKeys.push(key);
      }
    }

    p03AnomalousCount = anomalousKeys.length;
    const prevalence = resourceUsageMap.size > 0 ? p03AnomalousCount / resourceUsageMap.size : 0;
    p03Status = p03AnomalousCount > 0 ? 'PATTERN_DETECTED' : 'PATTERN_NOT_DETECTED';
    p03Summary = p03Status === 'PATTERN_DETECTED'
      ? `Anomalía de consumo detectada: se identificaron desviaciones de consumo o insumos no planificados en ${p03AnomalousCount} recursos.`
      : `Consumo de recursos conforme y balanceado frente a la demanda planificada.`;
  }

  patterns.push({
    patternKey: 'P-03_RESOURCE_CONSUMPTION_ANOMALY',
    scope,
    detectionStatus: p03Status,
    sampleSize: allUsedRes.length,
    minRequiredSampleSize: minN,
    confidenceScore: allUsedRes.length >= minN ? round2(Math.min(1.0, allUsedRes.length / (minN * 2))) : 0,
    thresholdsApplied: {
      resourceVarianceDeltaRatioThreshold: resRatioTh,
      minSampleSize: minN,
    },
    supportingMetricKeys: ['METRIC_RESOURCE_CONSUMPTION_RATIO', 'METRIC_RESOURCE_VARIANCE_DELTA'],
    empiricalEvidence: {
      summary: p03Summary,
      factsEvaluatedCount: allUsedRes.length,
      anomalousFactsCount: p03AnomalousCount,
      prevalenceRatio: allUsedRes.length > 0 ? round4(p03AnomalousCount / allUsedRes.length) : 0,
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P-04: HIDDEN_MULTIDAY_DRAG
  // Regla: Actividades de 1 día planificado que toman >= 2 días de campo en >= 70% de los casos
  // ───────────────────────────────────────────────────────────────────────────
  const multidayDaysTh = config.multidayDragThresholdDays ?? 2;
  const multidayPrevTh = config.multidayPrevalenceThreshold ?? 0.70;

  let p04Status: OperationalPatternResult['detectionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let p04AnomalousCount = 0;
  let p04EvaluatedCount = 0;

  for (const item of planItems) {
    const itemExecs = executions.filter(
      (e) => (e.weekly_plan_item_id === item.id || (e as any).occurrence_key === item.occurrence_key) && e.verification_status !== 'rejected'
    );
    if (itemExecs.length > 0) {
      p04EvaluatedCount++;
      const uniqueDays = new Set(itemExecs.map((e) => e.execution_date).filter(Boolean)).size;
      if (uniqueDays >= multidayDaysTh) {
        p04AnomalousCount++;
      }
    }
  }

  if (p04EvaluatedCount < minN) {
    p04Status = 'INSUFFICIENT_EVIDENCE';
  } else {
    const prev = p04AnomalousCount / p04EvaluatedCount;
    p04Status = prev >= multidayPrevTh ? 'PATTERN_DETECTED' : 'PATTERN_NOT_DETECTED';
  }

  const p04PrevRatio = p04EvaluatedCount > 0 ? round4(p04AnomalousCount / p04EvaluatedCount) : 0;

  patterns.push({
    patternKey: 'P-04_HIDDEN_MULTIDAY_DRAG',
    scope,
    detectionStatus: p04Status,
    sampleSize: p04EvaluatedCount,
    minRequiredSampleSize: minN,
    confidenceScore: p04EvaluatedCount >= minN ? round2(Math.min(1.0, p04EvaluatedCount / (minN * 2))) : 0,
    thresholdsApplied: {
      multidayDragThresholdDays: multidayDaysTh,
      multidayPrevalenceThreshold: multidayPrevTh,
      minSampleSize: minN,
    },
    supportingMetricKeys: ['METRIC_MULTIDAY_DURATION_DAYS', 'METRIC_DAILY_EXECUTION_INTENSITY'],
    empiricalEvidence: {
      summary: p04Status === 'PATTERN_DETECTED'
        ? `Arrastre multidía oculto detectado: ${p04AnomalousCount} de ${p04EvaluatedCount} actividades (${round2(p04PrevRatio * 100)}%) requirieron >= ${multidayDaysTh} jornadas reales de campo.`
        : p04Status === 'INSUFFICIENT_EVIDENCE'
        ? `Evidencia insuficiente: ${p04EvaluatedCount} actividades evaluadas (mínimo ${minN}).`
        : `Las actividades se ejecutan en jornadas únicas conforme a la planificación.`,
      factsEvaluatedCount: p04EvaluatedCount,
      anomalousFactsCount: p04AnomalousCount,
      prevalenceRatio: p04PrevRatio,
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P-05: OPERATIONAL_BOTTLENECK
  // Regla: Tasa de rechazo > 20% o lead time > 72h o ejecuciones pendientes > 40%
  // ───────────────────────────────────────────────────────────────────────────
  const leadTimeTh = config.verificationLeadTimeHoursThreshold ?? 72;
  const pendingTh = config.verificationPendingRateThreshold ?? 0.40;

  const leadTimeMetric = metricsMap.get('METRIC_VERIFICATION_LEAD_TIME_HOURS');
  const rejRateMetric = metricsMap.get('METRIC_VERIFICATION_REJECTION_RATE');

  const pendingExecutionsCount = executions.filter(
    (e) => e.verification_status === 'reported' || e.verification_status === 'evidence_pending'
  ).length;
  const totalExecsCount = executions.length;
  const pendingRatio = totalExecsCount > 0 ? pendingExecutionsCount / totalExecsCount : 0;

  let p05Status: OperationalPatternResult['detectionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let p05Summary = '';

  if (totalExecsCount < minN) {
    p05Status = 'INSUFFICIENT_EVIDENCE';
    p05Summary = `Muestra insuficiente para evaluar cuellos de botella (${totalExecsCount} < ${minN}).`;
  } else {
    const isLeadTimeHigh = leadTimeMetric?.value !== null && (leadTimeMetric?.value ?? 0) > leadTimeTh;
    const isPendingHigh = pendingRatio >= pendingTh;
    const isRejectionHigh = rejRateMetric?.value !== null && (rejRateMetric?.value ?? 0) > 0.20;

    if (isLeadTimeHigh || isPendingHigh || isRejectionHigh) {
      p05Status = 'PATTERN_DETECTED';
      p05Summary = `Cuello de botella operativo detectado (${round2(pendingRatio * 100)}% pendientes de verificación, Lead Time = ${leadTimeMetric?.value ?? 'N/A'}h).`;
    } else {
      p05Status = 'PATTERN_NOT_DETECTED';
      p05Summary = 'Flujo de verificación fluido sin cuellos de botella operacionales.';
    }
  }

  patterns.push({
    patternKey: 'P-05_OPERATIONAL_BOTTLENECK',
    scope,
    detectionStatus: p05Status,
    sampleSize: totalExecsCount,
    minRequiredSampleSize: minN,
    confidenceScore: totalExecsCount >= minN ? round2(Math.min(1.0, totalExecsCount / (minN * 2))) : 0,
    thresholdsApplied: {
      verificationPendingRateThreshold: pendingTh,
      verificationLeadTimeHoursThreshold: leadTimeTh,
      minSampleSize: minN,
    },
    supportingMetricKeys: ['METRIC_VERIFICATION_LEAD_TIME_HOURS', 'METRIC_VERIFICATION_REJECTION_RATE'],
    empiricalEvidence: {
      summary: p05Summary,
      factsEvaluatedCount: totalExecsCount,
      anomalousFactsCount: pendingExecutionsCount,
      prevalenceRatio: round4(pendingRatio),
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P-06: RECURRENT_RESCHEDULE_DRAG
  // Regla: Ocurrencias con reschedule_count >= 2
  // ───────────────────────────────────────────────────────────────────────────
  const reschedTh = config.rescheduleCountThreshold ?? 2;
  const totalReschedOccurrences = reschedules.length;
  const draggedOccurrences = reschedules.filter((r) => (r.reschedule_count || 0) >= reschedTh);

  let p06Status: OperationalPatternResult['detectionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let p06Summary = '';

  if (totalReschedOccurrences < minN) {
    p06Status = 'INSUFFICIENT_EVIDENCE';
    p06Summary = `Muestra insuficiente de reprogramaciones (${totalReschedOccurrences} < ${minN}).`;
  } else {
    const prev = draggedOccurrences.length / totalReschedOccurrences;
    p06Status = draggedOccurrences.length > 0 ? 'PATTERN_DETECTED' : 'PATTERN_NOT_DETECTED';
    p06Summary = p06Status === 'PATTERN_DETECTED'
      ? `Arrastre por reprogramaciones recurrentes detectado en ${draggedOccurrences.length} ocurrencias con >= ${reschedTh} reprogramaciones.`
      : 'Reprogramaciones esporádicas dentro del rango operativo normal.';
  }

  patterns.push({
    patternKey: 'P-06_RECURRENT_RESCHEDULE_DRAG',
    scope,
    detectionStatus: p06Status,
    sampleSize: totalReschedOccurrences,
    minRequiredSampleSize: minN,
    confidenceScore: totalReschedOccurrences >= minN ? round2(Math.min(1.0, totalReschedOccurrences / (minN * 2))) : 0,
    thresholdsApplied: {
      rescheduleCountThreshold: reschedTh,
      minSampleSize: minN,
    },
    supportingMetricKeys: ['METRIC_RESCHEDULE_OCCURRENCE_COUNT'],
    empiricalEvidence: {
      summary: p06Summary,
      factsEvaluatedCount: totalReschedOccurrences,
      anomalousFactsCount: draggedOccurrences.length,
      prevalenceRatio: totalReschedOccurrences > 0 ? round4(draggedOccurrences.length / totalReschedOccurrences) : 0,
    },
  });

  return patterns;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fachada Principal del Read Model Analítico
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Función Principal Pura: Transforma los hechos operativos en métricas y patrones deterministas.
 */
export function evaluateOperationalMemoryAnalytics(
  input: OperationalMemoryAnalyticsInput,
  facts: OperationalFactsPayload
): OperationalMemoryAnalyticsResult {
  const evaluatedAtIso = input.evaluatedAt
    ? (typeof input.evaluatedAt === 'string' ? input.evaluatedAt : input.evaluatedAt.toISOString())
    : new Date().toISOString();

  const boardId = input.boardId;
  const scope: AnalyticsScope = {
    scopeType: 'BOARD',
    scopeId: boardId,
    scopeName: `Tablero ${boardId}`,
  };

  // Filtrado temporal y por filtros de entrada
  let filteredPlanItems = facts.planItems || [];
  let filteredExecutions = facts.executions || [];
  let filteredReschedules = facts.reschedules || [];

  if (input.occurrenceKeys && input.occurrenceKeys.length > 0) {
    const occSet = new Set(input.occurrenceKeys);
    filteredPlanItems = filteredPlanItems.filter((i) => occSet.has(i.occurrence_key));
    filteredExecutions = filteredExecutions.filter((e) => occSet.has((e as any).occurrence_key) || occSet.has(e.weekly_plan_item_id));
    filteredReschedules = filteredReschedules.filter((r) => occSet.has(r.occurrence_key));
  }

  if (input.crewIds && input.crewIds.length > 0) {
    const crewSet = new Set(input.crewIds);
    filteredPlanItems = filteredPlanItems.filter((i) => i.crew_id && crewSet.has(i.crew_id));
    filteredExecutions = filteredExecutions.filter((e) => e.crew_id_snapshot && crewSet.has(e.crew_id_snapshot));
  }

  if (input.dateFrom) {
    filteredPlanItems = filteredPlanItems.filter((i) => !i.planned_date || i.planned_date >= input.dateFrom!);
    filteredExecutions = filteredExecutions.filter((e) => !e.execution_date || e.execution_date >= input.dateFrom!);
  }

  if (input.dateTo) {
    filteredPlanItems = filteredPlanItems.filter((i) => !i.planned_date || i.planned_date <= input.dateTo!);
    filteredExecutions = filteredExecutions.filter((e) => !e.execution_date || e.execution_date <= input.dateTo!);
  }

  // 1. Calcular Métricas Deterministas
  const metrics = computeOperationalMetrics(
    scope,
    filteredPlanItems,
    filteredExecutions,
    filteredReschedules,
    facts.requiredResourcesMap
  );

  // 2. Detectar Patrones Deterministas
  const patterns = detectOperationalPatterns(
    scope,
    metrics,
    filteredPlanItems,
    filteredExecutions,
    filteredReschedules,
    input.patternThresholdOverrides
  );

  const verifiedCount = filteredExecutions.filter((e) => {
    const st = (e.verification_status || '').toLowerCase();
    return st === 'verified' || st === 'confirmed' || st === 'closed';
  }).length;

  const rejectedCount = filteredExecutions.filter((e) => e.verification_status === 'rejected').length;
  const usedResourcesCount = filteredExecutions.flatMap((e) => e.used_resources || []).length;

  return {
    boardId,
    evaluationPeriod: {
      dateFrom: input.dateFrom || null,
      dateTo: input.dateTo || null,
      evaluatedAtIso,
    },
    totalFactsEvaluated: {
      planItemsCount: filteredPlanItems.length,
      executionRecordsCount: filteredExecutions.length,
      verifiedExecutionsCount: verifiedCount,
      rejectedExecutionsCount: rejectedCount,
      resourcesUsedCount: usedResourcesCount,
    },
    metrics,
    patterns,
  };
}
