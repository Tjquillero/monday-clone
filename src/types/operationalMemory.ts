/**
 * Types & Domain Contracts for Operational Memory & Observability Analytics (v1)
 *
 * Axioma de Separación Cognitiva:
 * HECHO != MÉTRICA != PATRÓN != RECOMENDACIÓN != DECISIÓN != RESULTADO
 *
 * Naturaleza:
 * Read Model / Servicio Analítico Consultivo Determinista (0 persistencia, 0 DDL, 0 mutaciones).
 */

import { VerificationStatus } from './execution';
import { ItemLifecycleStatus } from './weeklyPlan';
import { AdditionalResourceCategory } from '@/lib/resourceConsumptionControlService';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ámbitos de Análisis (Analytics Scopes)
// ─────────────────────────────────────────────────────────────────────────────

export type AnalyticsScopeType =
  | 'OCCURRENCE'
  | 'ACTIVITY'
  | 'CREW'
  | 'ZONE'
  | 'BOARD';

export interface AnalyticsScope {
  scopeType: AnalyticsScopeType;
  scopeId: string;
  scopeName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Estados de Suficiencia e Indeterminación
// ─────────────────────────────────────────────────────────────────────────────

export type SufficiencyStatus =
  | 'SUFFICIENT_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NO_DATA';

export type MetricValueStatus =
  | 'DETERMINED'
  | 'UNDETERMINED_ZERO_EFFORT'
  | 'UNDETERMINED_ZERO_QUANTITY'
  | 'UNDETERMINED_MISSING_PLAN'
  | 'UNDETERMINED_UNVERIFIED_DATA';

export type PatternDetectionStatus =
  | 'PATTERN_DETECTED'
  | 'PATTERN_NOT_DETECTED'
  | 'INSUFFICIENT_EVIDENCE';

// ─────────────────────────────────────────────────────────────────────────────
// 3. Catálogo Canónico de Llaves de Métricas v1
// ─────────────────────────────────────────────────────────────────────────────

export type OperationalMetricKey =
  | 'METRIC_PRODUCTIVITY_RATE'              // R_real = verified_qty / verified_jr (unidad/JR)
  | 'METRIC_THEORETICAL_PRODUCTIVITY_RATE'  // R_teo = planned_qty / theoretical_jr (unidad/JR)
  | 'METRIC_PRODUCTIVITY_INDEX'             // IP = R_real / R_teo (adimensional)
  | 'METRIC_EFFORT_VARIANCE_JR'             // Delta_JR = verified_jr - theoretical_jr (JR)
  | 'METRIC_MULTIDAY_DURATION_DAYS'         // Duración real en días de campo con ejecución (días)
  | 'METRIC_DAILY_EXECUTION_INTENSITY'      // Promedio worker_count y hours_worked por jornada
  | 'METRIC_RESOURCE_CONSUMPTION_RATIO'     // used_qty / verified_qty (recurso_unit / obra_unit)
  | 'METRIC_RESOURCE_VARIANCE_DELTA'        // used_qty - required_qty (recurso_unit)
  | 'METRIC_VERIFICATION_LEAD_TIME_HOURS'   // Horas promedio entre reporte físico y verificación
  | 'METRIC_VERIFICATION_REJECTION_RATE'    // rejected_count / total_reported_count (0..1)
  | 'METRIC_RESCHEDULE_OCCURRENCE_COUNT';   // Conteo de reprogramaciones de la ocurrencia (entero)

export interface OperationalMetricResult {
  metricKey: OperationalMetricKey;
  scope: AnalyticsScope;
  value: number | null;
  unit: string;
  valueStatus: MetricValueStatus;
  sufficiencyStatus: SufficiencyStatus;
  sampleSize: number;
  calculationTrace: {
    formula: string;
    inputs: Record<string, number | string | null | undefined>;
    notes?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Catálogo Canónico de Llaves de Patrones v1
// ─────────────────────────────────────────────────────────────────────────────

export type OperationalPatternKey =
  | 'P-01_SYSTEMATIC_UNDERESTIMATION'      // Actividades con IP < umbral de forma recurrente
  | 'P-02_CREW_PERFORMANCE_DISPERSION'     // Dispersión significativa de productividad entre cuadrillas
  | 'P-03_RESOURCE_CONSUMPTION_ANOMALY'    // Sobrecostos de insumos o uso recurrente de no planificados
  | 'P-04_HIDDEN_MULTIDAY_DRAG'            // Actividades planificadas en 1 día ejecutadas en >= 2 días
  | 'P-05_OPERATIONAL_BOTTLENECK'          // Zonas con retrasos severos de verificación o alta tasa de rechazo
  | 'P-06_RECURRENT_RESCHEDULE_DRAG'       // Ocurrencias con múltiples reprogramaciones acumuladas
  | 'P-05_DISCREPANCIA_MATERIALIZADA';      // Discrepancia tridimensional POA ↔ WeeklyPlan ↔ Execution

export interface PatternThresholdConfig {
  minSampleSize: number;
  underestimationIpThreshold?: number;     // default 0.85
  underestimationPrevalenceThreshold?: number; // default 0.75 (75%)
  crewDispersionCvThreshold?: number;      // default 0.25 (25% coef variación o delta)
  resourceVarianceDeltaRatioThreshold?: number; // default 0.15 (+15%)
  multidayDragThresholdDays?: number;      // default 2 jornadas
  multidayPrevalenceThreshold?: number;    // default 0.70 (70%)
  verificationPendingRateThreshold?: number; // default 0.40 (40%)
  verificationLeadTimeHoursThreshold?: number; // default 72h
  rescheduleCountThreshold?: number;       // default 2 reprogramaciones
}

export interface OperationalPatternResult {
  patternKey: OperationalPatternKey;
  scope: AnalyticsScope;
  detectionStatus: PatternDetectionStatus;
  sampleSize: number;
  minRequiredSampleSize: number;
  confidenceScore: number; // 0..1 basado en representatividad estadística
  thresholdsApplied: Record<string, number | string>;
  supportingMetricKeys: OperationalMetricKey[];
  empiricalEvidence: {
    summary: string;
    factsEvaluatedCount: number;
    anomalousFactsCount: number;
    prevalenceRatio: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Entradas y Salidas del Servicio de Analítica
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationalMemoryAnalyticsInput {
  boardId: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  occurrenceKeys?: string[];
  crewIds?: string[];
  activityKeys?: string[];
  patternThresholdOverrides?: Partial<PatternThresholdConfig>;
  evaluatedAt?: Date | string;
}

export interface OperationalMemoryAnalyticsResult {
  boardId: string;
  evaluationPeriod: {
    dateFrom: string | null;
    dateTo: string | null;
    evaluatedAtIso: string;
  };
  totalFactsEvaluated: {
    planItemsCount: number;
    executionRecordsCount: number;
    verifiedExecutionsCount: number;
    rejectedExecutionsCount: number;
    resourcesUsedCount: number;
  };
  metrics: OperationalMetricResult[];
  patterns: OperationalPatternResult[];
}
