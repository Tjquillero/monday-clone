/**
 * Types & Canonical Envelopes for Hito 7.1: Observability Runtime v1.0
 *
 * Naturaleza:
 * Estructuras de datos puramente observacionales (solo lectura, en memoria).
 *
 * Axioma de Separación Cognitiva (H7.1):
 * OBSERVACIÓN (HECHO) != DIAGNÓSTICO != RECOMENDACIÓN != ACCIÓN
 * Un EventEnvelope captura única y exclusivamente evidencia y contexto del HECHO.
 */

export type ObservabilityEventType =
  | 'UI_ERROR'
  | 'API_ERROR'
  | 'TEST_FAILURE'
  | 'TYPESCRIPT_ERROR'
  | 'BUILD_FAILURE'
  | 'MATERIALIZATION_DRIFT'
  | 'EXECUTION_ANOMALY'
  | 'VERIFICATION_ANOMALY'
  | 'PERFORMANCE_SIGNAL';

export type ObservabilitySeverity =
  | 'INFO'
  | 'WARN'
  | 'ERROR'
  | 'CRITICAL';

export interface ObservabilityTechnicalContext {
  boardId?: string;
  siteId?: string;
  occurrenceKey?: string;
  sessionId?: string;
  componentName?: string;
  route?: string;
  timezone?: string; // e.g. 'America/Bogota'
  environment: 'development' | 'test' | 'production';
  additionalMeta?: Record<string, unknown>;
}

/**
 * EventEnvelope<T> — Sobre Canónico de Observabilidad
 *
 * Garantía: NO contiene campos de diagnóstico, solución, parche ni recomendación.
 * Distinción Semántica:
 * - timestamp: Instante absoluto UTC ISO 8601.
 * - context.timezone: Zona horaria civil de presentación/contexto.
 */
export interface EventEnvelope<T = unknown> {
  eventId: string;
  correlationId: string;
  timestamp: string; // ISO 8601 Absolute Instant (UTC)
  source: string;
  eventType: ObservabilityEventType;
  severity: ObservabilitySeverity;
  payload: T;
  context: ObservabilityTechnicalContext;
}

export interface ObservabilityFactRecord {
  factId: string;
  correlationId: string;
  factType: string;
  description: string;
  observedAt: string;
  sourceComponent: string;
  rawEnvelopeId: string;
  attributes: Record<string, number | string | boolean | null>;
}

export interface ObservabilityCorrelationResult {
  correlationId: string;
  evaluatedAt: string;
  factCount: number;
  facts: ObservabilityFactRecord[];
  memoryAnalyticsSummary: {
    boardId: string;
    evaluatedMetricsCount: number;
    detectedPatternsCount: number;
    totalFactsEvaluated: {
      planItemsCount: number;
      executionRecordsCount: number;
      verifiedExecutionsCount: number;
      rejectedExecutionsCount: number;
      resourcesUsedCount: number;
    };
  } | null;
}
