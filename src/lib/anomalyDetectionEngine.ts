/**
 * Engine: Anomaly Detection Engine (Hito 7.2 v1.0)
 *
 * Naturaleza:
 * Motor Consultivo 100% Determinístico en Memoria de Detección de Anomalías Operativas.
 *
 * Axiomas de Gobierno Cognitivo (H7.2):
 * 1. DETECCIÓN != DIAGNÓSTICO CAUSAL (Detecta la existencia de una desviación, NO explica la causa raíz).
 * 2. Un AnomalyRecord es puramente descriptivo y exige diagnóstico posterior (requiresDiagnosis = true).
 * 3. Distinción Epistemológica: 'NO_ANOMALY' (evaluado sin desviación) != 'INDETERMINATE' (datos insuficientes para evaluar).
 * 4. 0 dependencias de LLM o modelos probabilísticos en H7.2 (100% basado en reglas y umbrales determinísticos).
 * 5. Severidad derivada exclusivamente mediante límites matemáticos explícitos sobre ratios de desviación.
 * 6. Cero escrituras en PostgreSQL / Supabase, cero DDL, cero RPCs de escritura.
 */

import {
  AnomalyRecord,
  AnomalySeverity,
  AnomalyThresholdConfig,
  DEFAULT_ANOMALY_THRESHOLDS,
  AnomalyDetectionEvaluationResult,
} from '@/types/anomalyDetection';
import { EventEnvelope } from '@/types/observabilityRuntime';
import {
  evaluateOperationalMemoryAnalytics,
  OperationalFactsPayload,
} from './operationalMemoryAnalyticsService';

/**
 * Deriva determinísticamente la severidad basada en límites matemáticos explícitos:
 * - ratio < 0.10        -> 'INFO'
 * - 0.10 <= ratio < 0.20 -> 'LOW'
 * - 0.20 <= ratio < 0.35 -> 'MEDIUM'
 * - 0.35 <= ratio < 0.50 -> 'HIGH'
 * - ratio >= 0.50        -> 'CRITICAL'
 */
export function deriveDeterministicSeverity(deviationRatio: number | null): AnomalySeverity {
  if (deviationRatio === null || isNaN(deviationRatio)) {
    return 'INFO';
  }

  const absRatio = Math.abs(deviationRatio);

  if (absRatio >= 0.50) return 'CRITICAL';
  if (absRatio >= 0.35) return 'HIGH';
  if (absRatio >= 0.20) return 'MEDIUM';
  if (absRatio >= 0.10) return 'LOW';
  return 'INFO';
}

/**
 * Genera un id único determinístico para un AnomalyRecord
 */
function generateAnomalyId(category: string): string {
  return `anom-${category.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

export interface EvaluateAnomaliesInput {
  memoryPayload?: OperationalFactsPayload;
  observabilityEvents?: EventEnvelope[];
  configOverrides?: Partial<AnomalyThresholdConfig>;
}

/**
 * 1. Detector de Anomalías de Ejecución Física (EXECUTION)
 */
export function detectExecutionAnomalies(
  memoryPayload: OperationalFactsPayload,
  config: AnomalyThresholdConfig
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (!memoryPayload.planItems || memoryPayload.planItems.length === 0) return anomalies;

  const boardId = memoryPayload.planItems[0].board_id || 'unknown-board';
  const memoryResult = evaluateOperationalMemoryAnalytics({ boardId }, memoryPayload);

  for (const metric of memoryResult.metrics) {
    if (metric.metricKey === 'METRIC_PRODUCTIVITY_INDEX' && metric.value !== null) {
      const expectedIp = 1.0;
      const observedIp = metric.value;
      const deviation = observedIp - expectedIp;
      const deviationRatio = (expectedIp - observedIp) / expectedIp;

      if (deviationRatio >= config.executionDeviationRatioThreshold) {
        anomalies.push({
          id: generateAnomalyId('EXECUTION'),
          detectedAt: new Date().toISOString(),
          source: 'OperationalMemoryAnalyticsService:METRIC_PRODUCTIVITY_INDEX',
          metricKey: metric.metricKey,
          observedValue: observedIp,
          expectedValue: expectedIp,
          deviation,
          deviationRatio,
          threshold: config.executionDeviationRatioThreshold,
          anomalyType: 'ANOMALY_EXECUTION_PRODUCTIVITY_DEFICIT',
          category: 'EXECUTION',
          severity: deriveDeterministicSeverity(deviationRatio),
          evidence: [
            {
              sourceId: metric.scope.scopeId,
              description: `Productivity Index observed (${observedIp.toFixed(2)}) is below baseline (${expectedIp.toFixed(2)}) by ${(deviationRatio * 100).toFixed(1)}%.`,
            },
          ],
          detectionRule: `deviationRatio >= ${config.executionDeviationRatioThreshold}`,
          requiresDiagnosis: true,
        });
      }
    }
  }

  return anomalies;
}

/**
 * 2. Detector de Anomalías de Verificación (VERIFICATION)
 */
export function detectVerificationAnomalies(
  memoryPayload: OperationalFactsPayload,
  config: AnomalyThresholdConfig
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (!memoryPayload.executions || memoryPayload.executions.length === 0) return anomalies;

  const totalCount = memoryPayload.executions.length;
  const rejectedCount = memoryPayload.executions.filter(
    (e) => e.verification_status === 'rejected'
  ).length;

  const rejectionRate = totalCount > 0 ? rejectedCount / totalCount : 0;

  if (rejectionRate >= config.verificationRejectionRateThreshold && totalCount >= 2) {
    const deviationRatio = rejectionRate;
    anomalies.push({
      id: generateAnomalyId('VERIFICATION'),
      detectedAt: new Date().toISOString(),
      source: 'ExecutionRecords:verification_status',
      metricKey: 'METRIC_VERIFICATION_REJECTION_RATE',
      observedValue: rejectionRate,
      expectedValue: 0.0,
      deviation: rejectionRate,
      deviationRatio,
      threshold: config.verificationRejectionRateThreshold,
      anomalyType: 'ANOMALY_VERIFICATION_REJECTION_SPIKE',
      category: 'VERIFICATION',
      severity: deriveDeterministicSeverity(deviationRatio),
      evidence: [
        {
          sourceId: 'execution-batch',
          description: `Verification rejection rate (${(rejectionRate * 100).toFixed(1)}%) exceeds threshold (${(config.verificationRejectionRateThreshold * 100).toFixed(1)}%). Rejected: ${rejectedCount}/${totalCount}.`,
        },
      ],
      detectionRule: `rejectionRate >= ${config.verificationRejectionRateThreshold}`,
      requiresDiagnosis: true,
    });
  }

  return anomalies;
}

/**
 * 3. Detector de Anomalías de Materialización Contractual / Alcance (MATERIALIZATION)
 */
export function detectMaterializationAnomalies(
  memoryPayload: OperationalFactsPayload,
  _config: AnomalyThresholdConfig
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (!memoryPayload.planItems || memoryPayload.planItems.length === 0) return anomalies;

  for (const item of memoryPayload.planItems) {
    if (item.planned_qty !== undefined && item.planned_qty <= 0 && item.activity_key) {
      anomalies.push({
        id: generateAnomalyId('MATERIALIZATION'),
        detectedAt: new Date().toISOString(),
        source: 'WeeklyPlanItems:planned_qty',
        metricKey: 'METRIC_MATERIALIZATION_SCOPE_MISMATCH',
        observedValue: item.planned_qty,
        expectedValue: 1.0,
        deviation: -1.0,
        deviationRatio: 1.0,
        threshold: 0,
        anomalyType: 'CONTRACT_SCOPE_MATERIALIZATION_MISMATCH',
        category: 'MATERIALIZATION',
        severity: 'HIGH',
        evidence: [
          {
            sourceId: item.id,
            description: `Plan item ${item.id} (activity_key: ${item.activity_key}) has zero/invalid planned_qty (${item.planned_qty}) despite being active in plan.`,
          },
        ],
        detectionRule: `planned_qty <= 0 && activity_key != null`,
        requiresDiagnosis: true,
      });
    }
  }

  return anomalies;
}

/**
 * 4. Detector de Anomalías de Insumos y Costos (RESOURCE)
 */
export function detectResourceAnomalies(
  memoryPayload: OperationalFactsPayload,
  config: AnomalyThresholdConfig
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (!memoryPayload.executions || memoryPayload.executions.length === 0) return anomalies;

  for (const exec of memoryPayload.executions) {
    if (exec.used_resources && Array.isArray(exec.used_resources)) {
      for (const resource of exec.used_resources as Array<{ resourceKey?: string; quantity?: number; expectedQuantity?: number }>) {
        if (resource.quantity !== undefined && resource.expectedQuantity !== undefined && resource.expectedQuantity > 0) {
          const deltaRatio = (resource.quantity - resource.expectedQuantity) / resource.expectedQuantity;
          if (deltaRatio >= config.resourceVarianceDeltaRatioThreshold) {
            anomalies.push({
              id: generateAnomalyId('RESOURCE'),
              detectedAt: new Date().toISOString(),
              source: 'ExecutionRecords:used_resources',
              metricKey: 'METRIC_RESOURCE_VARIANCE_DELTA_RATIO',
              observedValue: resource.quantity,
              expectedValue: resource.expectedQuantity,
              deviation: resource.quantity - resource.expectedQuantity,
              deviationRatio: deltaRatio,
              threshold: config.resourceVarianceDeltaRatioThreshold,
              anomalyType: 'ANOMALY_RESOURCE_OVERCONSUMPTION',
              category: 'RESOURCE',
              severity: deriveDeterministicSeverity(deltaRatio),
              evidence: [
                {
                  sourceId: exec.id,
                  description: `Resource [${resource.resourceKey || 'unknown'}] consumed quantity (${resource.quantity}) exceeds expected (${resource.expectedQuantity}) by ${(deltaRatio * 100).toFixed(1)}%.`,
                },
              ],
              detectionRule: `deltaRatio >= ${config.resourceVarianceDeltaRatioThreshold}`,
              requiresDiagnosis: true,
            });
          }
        }
      }
    }
  }

  return anomalies;
}

/**
 * 5. Detector de Anomalías de Reprogramaciones (RESCHEDULE)
 */
export function detectRescheduleAnomalies(
  memoryPayload: OperationalFactsPayload,
  config: AnomalyThresholdConfig
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (!memoryPayload.reschedules || memoryPayload.reschedules.length === 0) return anomalies;

  for (const res of memoryPayload.reschedules) {
    if (res.reschedule_count >= config.rescheduleCountThreshold) {
      const deviationRatio = res.reschedule_count / config.rescheduleCountThreshold;
      anomalies.push({
        id: generateAnomalyId('RESCHEDULE'),
        detectedAt: new Date().toISOString(),
        source: 'RescheduleOccurrenceFacts:reschedule_count',
        metricKey: 'METRIC_RESCHEDULE_FREQUENCY_SPIKE',
        observedValue: res.reschedule_count,
        expectedValue: 0,
        deviation: res.reschedule_count,
        deviationRatio,
        threshold: config.rescheduleCountThreshold,
        anomalyType: 'ANOMALY_HIGH_RESCHEDULE_FREQUENCY',
        category: 'RESCHEDULE',
        severity: deriveDeterministicSeverity(deviationRatio - 1),
        evidence: [
          {
            sourceId: res.occurrence_key,
            description: `Occurrence [${res.occurrence_key}] rescheduled ${res.reschedule_count} times (threshold: ${config.rescheduleCountThreshold}). Last reason: ${res.last_override_reason || 'N/A'}.`,
          },
        ],
        detectionRule: `reschedule_count >= ${config.rescheduleCountThreshold}`,
        requiresDiagnosis: true,
      });
    }
  }

  return anomalies;
}

/**
 * 6. Detector de Anomalías de Telemetría (TELEMETRY)
 */
export function detectTelemetryAnomalies(
  events: EventEnvelope[],
  config: AnomalyThresholdConfig
): AnomalyRecord[] {
  const anomalies: AnomalyRecord[] = [];
  if (!events || events.length === 0) return anomalies;

  const errorEvents = events.filter(
    (e) => e.severity === 'ERROR' || e.severity === 'CRITICAL'
  );

  if (errorEvents.length >= config.telemetryErrorSpikeThreshold) {
    const deviationRatio = errorEvents.length / config.telemetryErrorSpikeThreshold;

    anomalies.push({
      id: generateAnomalyId('TELEMETRY'),
      detectedAt: new Date().toISOString(),
      source: 'ObservabilityRuntimeService:getObservabilityBuffer',
      metricKey: 'METRIC_TELEMETRY_ERROR_COUNT',
      observedValue: errorEvents.length,
      expectedValue: 0,
      deviation: errorEvents.length,
      deviationRatio,
      threshold: config.telemetryErrorSpikeThreshold,
      anomalyType: 'ANOMALY_TELEMETRY_ERROR_SPIKE',
      category: 'TELEMETRY',
      severity: deriveDeterministicSeverity(deviationRatio - 1),
      evidence: errorEvents.map((env) => ({
        sourceId: env.eventId,
        description: `[${env.severity}] ${env.source}: ${env.eventType}`,
      })),
      detectionRule: `errorEvents.length >= ${config.telemetryErrorSpikeThreshold}`,
      requiresDiagnosis: true,
    });
  }

  return anomalies;
}

/**
 * Evaluador Principal Determinístico del Engine H7.2
 * Retorna AnomalyDetectionEvaluationResult con distinción estricta de:
 * - 'INDETERMINATE': Datos insuficientes o nulos para realizar evaluación.
 * - 'NO_ANOMALY': Datos evaluados correctamente con 0 anomalías encontradas.
 * - 'ANOMALY_DETECTED': Datos evaluados correctamente con 1+ anomalías detectadas.
 */
export function evaluateAnomalyDetection(
  input: EvaluateAnomaliesInput
): AnomalyDetectionEvaluationResult {
  const config: AnomalyThresholdConfig = {
    ...DEFAULT_ANOMALY_THRESHOLDS,
    ...input.configOverrides,
  };

  const planItemsCount = input.memoryPayload?.planItems?.length || 0;
  const executionsCount = input.memoryPayload?.executions?.length || 0;
  const reschedulesCount = input.memoryPayload?.reschedules?.length || 0;
  const eventsCount = input.observabilityEvents?.length || 0;

  const evaluatedSourcesCount = planItemsCount + executionsCount + reschedulesCount + eventsCount;

  if (evaluatedSourcesCount === 0) {
    return {
      status: 'INDETERMINATE',
      anomalies: [],
      evaluatedAt: new Date().toISOString(),
      evaluatedSourcesCount: 0,
      reason: 'Insufficient operational payload or telemetry events to evaluate anomaly detection.',
    };
  }

  const detectedAnomalies: AnomalyRecord[] = [];

  if (input.memoryPayload) {
    detectedAnomalies.push(...detectExecutionAnomalies(input.memoryPayload, config));
    detectedAnomalies.push(...detectVerificationAnomalies(input.memoryPayload, config));
    detectedAnomalies.push(...detectMaterializationAnomalies(input.memoryPayload, config));
    detectedAnomalies.push(...detectResourceAnomalies(input.memoryPayload, config));
    detectedAnomalies.push(...detectRescheduleAnomalies(input.memoryPayload, config));
  }

  if (input.observabilityEvents) {
    detectedAnomalies.push(...detectTelemetryAnomalies(input.observabilityEvents, config));
  }

  if (detectedAnomalies.length > 0) {
    return {
      status: 'ANOMALY_DETECTED',
      anomalies: detectedAnomalies,
      evaluatedAt: new Date().toISOString(),
      evaluatedSourcesCount,
    };
  }

  return {
    status: 'NO_ANOMALY',
    anomalies: [],
    evaluatedAt: new Date().toISOString(),
    evaluatedSourcesCount,
  };
}
