/**
 * Service: Observability Runtime (Hito 7.1 v1.0)
 *
 * Naturaleza:
 * Servicio de Telemetría y Captura Estructurada de Hechos (100% Solo Lectura en Memoria).
 *
 * Axiomas de Gobierno H7.1:
 * 1. Captura y empaqueta HECHOS y MÉTRICAS sin realizar autodiagnósticos, ni recomendaciones, ni parches.
 * 2. Cero escrituras en PostgreSQL / Supabase, cero DDL, cero mutaciones a la base de datos.
 * 3. Reutiliza OMA-01 (OperationalMemoryAnalyticsService) exclusivamente como fuente analítica de lectura.
 * 4. Determinístico e inmutable con sellos temporales en zona horaria America/Bogota.
 */

import {
  EventEnvelope,
  ObservabilityEventType,
  ObservabilitySeverity,
  ObservabilityTechnicalContext,
  ObservabilityFactRecord,
  ObservabilityCorrelationResult,
} from '@/types/observabilityRuntime';

import {
  evaluateOperationalMemoryAnalytics,
  OperationalFactsPayload,
} from '@/lib/operationalMemoryAnalyticsService';

// Almacenamiento puramente en memoria para el buffer de observabilidad de la sesión activa
const observabilityBuffer: EventEnvelope[] = [];

/**
 * Genera un identificador único determinístico o basado en crypto/Math.random
 */
function generateUniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${timestamp}-${randomStr}`;
}

/**
 * Retorna el timestamp civil ISO 8601 en la zona horaria America/Bogota
 */
export function getBogotaCivilTimestamp(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const formatted = formatter.format(date).replace(' ', 'T');
  return `${formatted}-05:00`;
}

export interface CreateEventParams<T> {
  eventType: ObservabilityEventType;
  severity: ObservabilitySeverity;
  source: string;
  payload: T;
  context?: Partial<ObservabilityTechnicalContext>;
  correlationId?: string;
}

/**
 * 1. Crea un sobre canónico de observabilidad EventEnvelope<T>
 */
export function createEventEnvelope<T = unknown>(
  params: CreateEventParams<T>
): EventEnvelope<T> {
  const correlationId = params.correlationId || generateUniqueId('corr');
  const eventId = generateUniqueId('evt');
  const timestamp = new Date().toISOString(); // Instante absoluto UTC ISO 8601

  const context: ObservabilityTechnicalContext = {
    timezone: 'America/Bogota', // Zona horaria civil por defecto
    environment: (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'test',
    ...params.context,
  };

  return {
    eventId,
    correlationId,
    timestamp,
    source: params.source,
    eventType: params.eventType,
    severity: params.severity,
    payload: params.payload,
    context,
  };
}

/**
 * 2. Extrae un hecho observable estructurado (ObservabilityFactRecord) a partir del sobre
 */
export function extractFactFromEnvelope<T = Record<string, unknown>>(
  envelope: EventEnvelope<T>
): ObservabilityFactRecord {
  const payloadObj = (typeof envelope.payload === 'object' && envelope.payload !== null
    ? envelope.payload
    : { value: String(envelope.payload) }) as Record<string, unknown>;

  const attributes: Record<string, number | string | boolean | null> = {};
  for (const [key, val] of Object.entries(payloadObj)) {
    if (
      typeof val === 'number' ||
      typeof val === 'string' ||
      typeof val === 'boolean' ||
      val === null
    ) {
      attributes[key] = val;
    } else {
      attributes[key] = JSON.stringify(val);
    }
  }

  return {
    factId: generateUniqueId('fact'),
    correlationId: envelope.correlationId,
    factType: envelope.eventType,
    description: `[${envelope.severity}] Event from ${envelope.source}: ${envelope.eventType}`,
    observedAt: envelope.timestamp,
    sourceComponent: envelope.source,
    rawEnvelopeId: envelope.eventId,
    attributes,
  };
}

/**
 * 3. Registra un evento en el buffer en memoria de observabilidad
 */
export function pushEventToObservabilityBuffer<T>(
  envelope: EventEnvelope<T>
): void {
  observabilityBuffer.push(envelope as EventEnvelope);
}

/**
 * Retorna una copia de lectura del buffer en memoria
 */
export function getObservabilityBuffer(): readonly EventEnvelope[] {
  return [...observabilityBuffer];
}

/**
 * Limpia el buffer en memoria para aislamiento entre pruebas
 */
export function clearObservabilityBuffer(): void {
  observabilityBuffer.length = 0;
}

/**
 * 4. Correlaciona hechos de observabilidad con OMA-01 (Memory Analytics Service) de forma consultiva
 */
export function correlateFactsWithMemoryAnalytics(
  correlationId: string,
  events: EventEnvelope[],
  memoryPayload?: OperationalFactsPayload
): ObservabilityCorrelationResult {
  const matchingEvents = events.filter((e) => e.correlationId === correlationId);
  const facts = matchingEvents.map((env) => extractFactFromEnvelope(env));

  let memoryAnalyticsSummary = null;

  if (memoryPayload && memoryPayload.planItems && memoryPayload.planItems.length > 0) {
    const boardId = memoryPayload.planItems[0].board_id || 'unknown-board';
    const memoryResult = evaluateOperationalMemoryAnalytics(
      { boardId },
      memoryPayload
    );

    memoryAnalyticsSummary = {
      boardId: memoryResult.boardId,
      evaluatedMetricsCount: memoryResult.metrics.length,
      detectedPatternsCount: memoryResult.patterns.filter(
        (p) => p.detectionStatus === 'PATTERN_DETECTED'
      ).length,
      totalFactsEvaluated: memoryResult.totalFactsEvaluated,
    };
  }

  return {
    correlationId,
    evaluatedAt: getBogotaCivilTimestamp(),
    factCount: facts.length,
    facts,
    memoryAnalyticsSummary,
  };
}
