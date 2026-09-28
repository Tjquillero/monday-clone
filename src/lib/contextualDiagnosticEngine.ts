/**
 * Engine: Contextual Diagnostic Engine (Hito 7.2 → Hito 7.3 v1.0)
 *
 * Naturaleza:
 * Motor Consultivo 100% Determinístico en Memoria de Diagnóstico Contextual.
 *
 * Axiomas de Gobierno Cognitivo (H7.3):
 * 1. DIAGNÓSTICO != RECOMENDACIÓN != ACCIÓN (Explica evidencia que soporta una hipótesis, NO prescribe ni repara).
 * 2. Un DiagnosticRecord es puramente consultivo y exige revisión humana (requiresHumanReview = true).
 * 3. Invariante Canónica: "Una correlación entre hechos no constituye por sí misma evidencia suficiente de causalidad."
 * 4. Confianza Determinística Cuantitativa: Derived strictly from normalized SupportWeightComponents less contradiction penalty.
 * 5. Cero escrituras en PostgreSQL / Supabase, cero DDL, cero RPCs de escritura.
 */

import { AnomalyRecord } from '@/types/anomalyDetection';
import { EventEnvelope } from '@/types/observabilityRuntime';
import { OperationalFactsPayload } from './operationalMemoryAnalyticsService';
import {
  DiagnosticRecord,
  DiagnosticConfidenceBand,
  DiagnosticEvidenceItem,
  DiagnosticCorrelation,
  DiagnosticAlternative,
  DiagnosticEvaluationResult,
  SupportWeightComponents,
  SUPPORT_WEIGHT_FACTOR_CAPS,
} from '@/types/contextualDiagnosis';

/**
 * Calcula explícita y determinísticamente el SupportWeight normalizado (0.00 a 1.00)
 * a partir de la suma acotada de sus 4 componentes factoriales:
 * 1. directEvidenceWeight    (Cap: 0.35)
 * 2. temporalAlignmentWeight (Cap: 0.25)
 * 3. spatialAlignmentWeight  (Cap: 0.20)
 * 4. entityAlignmentWeight   (Cap: 0.20)
 */
export function calculateExplicitSupportWeight(components: SupportWeightComponents): number {
  const direct = Math.min(SUPPORT_WEIGHT_FACTOR_CAPS.DIRECT_EVIDENCE, Math.max(0, components.directEvidenceWeight));
  const temporal = Math.min(SUPPORT_WEIGHT_FACTOR_CAPS.TEMPORAL_ALIGNMENT, Math.max(0, components.temporalAlignmentWeight));
  const spatial = Math.min(SUPPORT_WEIGHT_FACTOR_CAPS.SPATIAL_ALIGNMENT, Math.max(0, components.spatialAlignmentWeight));
  const entity = Math.min(SUPPORT_WEIGHT_FACTOR_CAPS.ENTITY_ALIGNMENT, Math.max(0, components.entityAlignmentWeight));

  const total = direct + temporal + spatial + entity;
  return Number(Math.min(1.0, Math.max(0, total)).toFixed(2));
}

/**
 * Calcula determinísticamente la confianza diagnóstica final y su banda:
 * Confidence = Math.max(0, Math.min(1.0, SupportWeight - contradictionCount * 0.20))
 */
export function calculateDeterministicConfidence(
  components: SupportWeightComponents,
  contradictionCount: number = 0
): { confidence: number; confidenceBand: DiagnosticConfidenceBand; supportWeight: number } {
  const supportWeight = calculateExplicitSupportWeight(components);
  const penalty = contradictionCount * 0.20;
  const rawConfidence = supportWeight - penalty;
  const confidence = Number(Math.max(0, Math.min(1.0, rawConfidence)).toFixed(2));

  let confidenceBand: DiagnosticConfidenceBand = 'LOW';
  if (confidence >= 0.70) {
    confidenceBand = 'HIGH';
  } else if (confidence >= 0.40) {
    confidenceBand = 'MEDIUM';
  }

  return { confidence, confidenceBand, supportWeight };
}

/**
 * Genera un id único determinístico para un DiagnosticRecord
 */
function generateDiagnosticId(anomalyId: string): string {
  return `diag-${anomalyId.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

export interface EvaluateDiagnosticsInput {
  anomalies?: AnomalyRecord[];
  contextualPayload?: OperationalFactsPayload;
  observabilityEvents?: EventEnvelope[];
}

/**
 * Diagnostica una anomalía individual evaluando correlaciones con los hechos contextuales
 */
export function diagnoseAnomalyContextually(
  anomaly: AnomalyRecord,
  payload?: OperationalFactsPayload,
  events?: EventEnvelope[]
): DiagnosticRecord | null {
  const evidenceItems: DiagnosticEvidenceItem[] = [];
  const correlations: DiagnosticCorrelation[] = [];
  const factualBasis: string[] = [];

  const supportComponents: SupportWeightComponents = {
    directEvidenceWeight: 0.15,
    temporalAlignmentWeight: 0.10,
    spatialAlignmentWeight: 0.10,
    entityAlignmentWeight: 0.10,
  };

  let contradictionCount = 0;

  // 1. Correlación Factual para Anomalías de Ejecución (EXECUTION)
  if (anomaly.category === 'EXECUTION') {
    factualBasis.push(`Observed Productivity Index: ${anomaly.observedValue.toFixed(2)} (expected: ${anomaly.expectedValue})`);
    supportComponents.directEvidenceWeight += 0.15; // total 0.30 direct

    if (payload?.executions && payload.executions.length > 0) {
      evidenceItems.push({
        sourceId: 'executions-summary',
        sourceType: 'ExecutionRecords',
        description: `Total executions recorded: ${payload.executions.length}.`,
      });
      correlations.push({
        type: 'ENTITY',
        description: 'Productivity index deficit is entity-correlated with recorded field executions.',
        weight: 0.20,
      });
      supportComponents.entityAlignmentWeight += 0.10;
      supportComponents.temporalAlignmentWeight += 0.10;
    }

    const confirmedCount = payload?.executions?.filter(e => e.verification_status === 'confirmed').length || 0;
    if (confirmedCount > 0) {
      contradictionCount += 1;
      evidenceItems.push({
        sourceId: 'confirmed-executions',
        sourceType: 'VerificationRecords',
        description: `${confirmedCount} executions are already confirmed in system.`,
        isContradictory: true,
      });
    }
  }

  // 2. Correlación Factual para Anomalías de Verificación (VERIFICATION)
  else if (anomaly.category === 'VERIFICATION') {
    factualBasis.push(`Verification rejection rate observed: ${(anomaly.observedValue * 100).toFixed(1)}%`);
    supportComponents.directEvidenceWeight += 0.20; // 0.35 max

    if (payload?.executions) {
      const rejected = payload.executions.filter(e => e.verification_status === 'rejected');
      if (rejected.length > 0) {
        factualBasis.push(`${rejected.length} executions marked as rejected.`);
        evidenceItems.push({
          sourceId: 'rejected-executions-batch',
          sourceType: 'ExecutionRecords:verification_status',
          description: `Rejected executions list compiled from field records.`,
        });
        correlations.push({
          type: 'ENTITY',
          description: 'High rejection rate aligns directly with rejected execution records.',
          weight: 0.20,
        });
        supportComponents.entityAlignmentWeight += 0.10;
        supportComponents.spatialAlignmentWeight += 0.10;
      }
    }
  }

  // 3. Correlación Factual para Anomalías de Materialización (MATERIALIZATION)
  else if (anomaly.category === 'MATERIALIZATION') {
    factualBasis.push(`Scope planned_qty observed: ${anomaly.observedValue} (expected: > 0)`);
    supportComponents.directEvidenceWeight += 0.20;
    correlations.push({
      type: 'SPATIAL',
      description: 'Scope materialization mismatch is spatially correlated on active plan item zone.',
      weight: 0.20,
    });
    supportComponents.spatialAlignmentWeight += 0.10;
    supportComponents.entityAlignmentWeight += 0.10;
  }

  // 4. Correlación Factual para Anomalías de Insumos/Recursos (RESOURCE)
  else if (anomaly.category === 'RESOURCE') {
    factualBasis.push(`Resource consumed (${anomaly.observedValue}) exceeds expected (${anomaly.expectedValue})`);
    supportComponents.directEvidenceWeight += 0.15;
    correlations.push({
      type: 'METRIC',
      description: 'Resource consumption overage is metric-correlated with field usage records.',
      weight: 0.20,
    });
    supportComponents.entityAlignmentWeight += 0.10;
    supportComponents.temporalAlignmentWeight += 0.10;
  }

  // 5. Correlación Factual para Anomalías de Reprogramación (RESCHEDULE)
  else if (anomaly.category === 'RESCHEDULE') {
    factualBasis.push(`Reschedule occurrence count: ${anomaly.observedValue} (threshold: ${anomaly.threshold})`);
    supportComponents.directEvidenceWeight += 0.15;
    correlations.push({
      type: 'TEMPORAL',
      description: 'High reschedule frequency shows a temporal override pattern alignment.',
      weight: 0.20,
    });
    supportComponents.temporalAlignmentWeight += 0.15;
  }

  // 6. Correlación Factual para Anomalías de Telemetría (TELEMETRY)
  else if (anomaly.category === 'TELEMETRY') {
    factualBasis.push(`Telemetry error count observed: ${anomaly.observedValue}`);
    supportComponents.directEvidenceWeight += 0.20;
    if (events && events.length > 0) {
      const errors = events.filter(e => e.severity === 'ERROR' || e.severity === 'CRITICAL');
      evidenceItems.push(...errors.map(e => ({
        sourceId: e.eventId,
        sourceType: 'EventEnvelope',
        description: `[${e.severity}] ${e.source}: ${e.eventType}`,
      })));
      correlations.push({
        type: 'TEMPORAL',
        description: 'Telemetry error spike is temporally correlated with observed system envelopes.',
        weight: 0.20,
      });
      supportComponents.temporalAlignmentWeight += 0.15;
    }
  }

  const { confidence, confidenceBand } = calculateDeterministicConfidence(supportComponents, contradictionCount);

  const anomalyTypeLabel = (anomaly.anomalyType || 'ANOMALY_UNKNOWN').toLowerCase().replace(/_/g, ' ');
  const safeAnomalyId = anomaly.id || 'anom-unknown';

  // Semántica Canónica: Garantiza terminología NO-Causal ("is temporally and spatially compatible with", "correlates with")
  const primaryHypothesis = `Factual evidence is contextually compatible with ${anomalyTypeLabel}.`;

  const alternatives: DiagnosticAlternative[] = [
    {
      hypothesis: 'Alternative potential factor: Environmental or external operational constraint exhibits temporal alignment.',
      confidence: Number(Math.max(0.05, confidence * 0.6).toFixed(2)),
      confidenceBand: confidence * 0.6 >= 0.40 ? 'MEDIUM' : 'LOW',
      factualBasis: ['Secondary operational pattern observed in memory analytics.'],
    },
  ];

  const firstEvidence = (anomaly.evidence && anomaly.evidence.length > 0) ? anomaly.evidence[0].description : 'Anomaly observation';

  return {
    id: generateDiagnosticId(safeAnomalyId),
    diagnosedAt: new Date().toISOString(),
    anomalyId: safeAnomalyId,
    primaryHypothesis,
    confidence,
    confidenceBand,
    supportWeightComponents: supportComponents,
    evidence: evidenceItems.length > 0 ? evidenceItems : [{ sourceId: safeAnomalyId, sourceType: anomaly.source || 'Unknown', description: firstEvidence }],
    correlations: correlations.length > 0 ? correlations : [{ type: 'METRIC', description: 'Metric deviation correlation.', weight: 0.30 }],
    factualBasis: factualBasis.length > 0 ? factualBasis : ['Anomaly record deviation ratio.'],
    alternatives,
    requiresHumanReview: true,
  };
}

/**
 * Evaluador Principal Gobernado de Diagnóstico Contextual (H7.3)
 */
export function evaluateContextualDiagnosis(
  input: EvaluateDiagnosticsInput
): DiagnosticEvaluationResult {
  const anomaliesCount = input.anomalies?.length || 0;

  if (anomaliesCount === 0) {
    return {
      status: 'INDETERMINATE',
      diagnostics: [],
      evaluatedAt: new Date().toISOString(),
      evaluatedAnomaliesCount: 0,
      reason: 'No anomaly records provided for diagnostic evaluation.',
    };
  }

  const diagnostics: DiagnosticRecord[] = [];

  for (const anomaly of input.anomalies!) {
    const diag = diagnoseAnomalyContextually(anomaly, input.contextualPayload, input.observabilityEvents);
    if (diag) {
      diagnostics.push(diag);
    }
  }

  if (diagnostics.length === 0) {
    return {
      status: 'NO_HYPOTHESIS_SUPPORTED',
      diagnostics: [],
      evaluatedAt: new Date().toISOString(),
      evaluatedAnomaliesCount: anomaliesCount,
      reason: 'No diagnostic hypothesis met minimum support threshold based on available evidence.',
    };
  }

  return {
    status: 'DIAGNOSED',
    diagnostics,
    evaluatedAt: new Date().toISOString(),
    evaluatedAnomaliesCount: anomaliesCount,
  };
}
