/**
 * Types & Canonical Contracts for Hito 7.2: Anomaly Detection Engine v1.0
 *
 * Axiomas de Gobierno y Separación Cognitiva (H7.2):
 * 1. DETECCIÓN != DIAGNÓSTICO CAUSAL (H7.2 Detecta que ocurrió una desviación, NO responde por qué ocurrió).
 * 2. Un AnomalyRecord es puramente descriptivo y siempre exige diagnóstico posterior (`requiresDiagnosis: true`).
 * 3. 100% Determinístico en memoria (0 dependencia de LLM/Modelos probabilísticos para la detección).
 * 4. Derivación de Severidad basada en reglas explícitas y umbrales cuantitativos cerrados.
 * 5. Distinción Epistemológica: 'NO_ANOMALY' (evaluado sin desviación) != 'INDETERMINATE' (datos insuficientes para evaluar).
 */

export type AnomalyCategory =
  | 'EXECUTION'
  | 'VERIFICATION'
  | 'MATERIALIZATION'
  | 'RESOURCE'
  | 'RESCHEDULE'
  | 'TELEMETRY';

export type AnomalySeverity =
  | 'INFO'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type DetectionStatus =
  | 'NO_ANOMALY'
  | 'ANOMALY_DETECTED'
  | 'INDETERMINATE';

export interface AnomalyEvidenceItem {
  sourceId: string;
  description: string;
}

/**
 * AnomalyRecord — Contrato Canónico Descriptivo de Anomalía
 *
 * Garantía Cognitiva: NO incluye propiedades de rootCause, probableCause, recommendation, ni patch.
 */
export interface AnomalyRecord {
  id: string;
  detectedAt: string; // ISO 8601 UTC Instant
  source: string;
  metricKey: string;
  observedValue: number;
  expectedValue: number | null;
  deviation: number | null;
  deviationRatio: number | null;
  threshold: number | null;
  anomalyType: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  evidence: AnomalyEvidenceItem[];
  detectionRule: string;
  requiresDiagnosis: true; // Invariante Cognitiva
}

/**
 * Resultado Gobernado de Evaluación de Detección (H7.2)
 * Separa explícitamente la ausencia de anomalía del estado indeterminado por falta de evidencia.
 */
export interface AnomalyDetectionEvaluationResult {
  status: DetectionStatus;
  anomalies: AnomalyRecord[];
  evaluatedAt: string; // ISO 8601 UTC
  evaluatedSourcesCount: number;
  reason?: string;
}

export interface AnomalyThresholdConfig {
  executionDeviationRatioThreshold: number; // default 0.20 (20%)
  verificationRejectionRateThreshold: number; // default 0.25 (25%)
  resourceVarianceDeltaRatioThreshold: number; // default 0.15 (15%)
  rescheduleCountThreshold: number; // default 2 overrides
  telemetryErrorSpikeThreshold: number; // default 3 errors
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholdConfig = {
  executionDeviationRatioThreshold: 0.20,
  verificationRejectionRateThreshold: 0.25,
  resourceVarianceDeltaRatioThreshold: 0.15,
  rescheduleCountThreshold: 2,
  telemetryErrorSpikeThreshold: 3,
};
