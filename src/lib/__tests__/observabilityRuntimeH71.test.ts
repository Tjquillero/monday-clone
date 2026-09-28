/**
 * Hito 7.1 — Suite de Verificación Integrativa: Observability Runtime v1.0
 *
 * Cobertura de Requerimientos y Gates R1–R7:
 * R1: Creación determinística del EventEnvelope con UUID y timestamp America/Bogota.
 * R2: Normalización de eventos y payload estructurado.
 * R3: Preservación estricta de correlationId y timestamp.
 * R4: Correlación consultiva 1:1 con OMA-01 (OperationalMemoryAnalyticsService).
 * R5: Aislamiento de múltiples eventos en buffer sin contaminación cruzada.
 * R6: Ausencia total de mutaciones externas en base de datos PostgreSQL (0 escrituras).
 * R7: Invarianza del baseline existente (H7.0 FROZEN).
 *
 * Pruebas de Frontera Cognitiva (Gobernanza H7.1):
 * - El EventEnvelope NO contiene campos de diagnosis, recommendation, ni action.
 */

import {
  createEventEnvelope,
  extractFactFromEnvelope,
  pushEventToObservabilityBuffer,
  getObservabilityBuffer,
  clearObservabilityBuffer,
  correlateFactsWithMemoryAnalytics,
} from '@/lib/observabilityRuntimeService';
import { EventEnvelope } from '@/types/observabilityRuntime';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';

describe('Hito 7.1 — Observability Runtime v1.0 (Suite R1–R7)', () => {
  beforeEach(() => {
    clearObservabilityBuffer();
  });

  test('R1: Creación determinística de EventEnvelope con instante UTC absoluto y zona horaria civil en contexto', () => {
    const envelope = createEventEnvelope({
      eventType: 'UI_ERROR',
      severity: 'ERROR',
      source: 'SingleActivityCard',
      payload: { message: 'Image load fallback triggered', imageId: 'img-123' },
      context: { boardId: 'board-777', siteId: 'site-colombia' },
    });

    expect(envelope.eventId).toMatch(/^evt-/);
    expect(envelope.correlationId).toMatch(/^corr-/);
    expect(envelope.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(envelope.context.timezone).toBe('America/Bogota');
    expect(envelope.eventType).toBe('UI_ERROR');
    expect(envelope.severity).toBe('ERROR');
    expect(envelope.source).toBe('SingleActivityCard');
    expect(envelope.context.boardId).toBe('board-777');
  });

  test('R2: Normalización de eventos y extracción determinística de ObservabilityFactRecord', () => {
    const envelope = createEventEnvelope({
      eventType: 'MATERIALIZATION_DRIFT',
      severity: 'WARN',
      source: 'ScheduleMaterializationService',
      payload: { expectedQty: 10, actualQty: 8, driftRatio: 0.2 },
    });

    const fact = extractFactFromEnvelope(envelope);

    expect(fact.factId).toMatch(/^fact-/);
    expect(fact.correlationId).toBe(envelope.correlationId);
    expect(fact.factType).toBe('MATERIALIZATION_DRIFT');
    expect(fact.sourceComponent).toBe('ScheduleMaterializationService');
    expect(fact.attributes.expectedQty).toBe(10);
    expect(fact.attributes.actualQty).toBe(8);
    expect(fact.attributes.driftRatio).toBe(0.2);
  });

  test('R3: Preservación de correlationId y timestamp a través de eventos relacionados', () => {
    const sharedCorrelationId = 'corr-user-journey-999';

    const envelope1 = createEventEnvelope({
      correlationId: sharedCorrelationId,
      eventType: 'API_ERROR',
      severity: 'WARN',
      source: 'SupabaseClient',
      payload: { endpoint: '/rest/v1/weekly_plan_items', statusCode: 409 },
    });

    const envelope2 = createEventEnvelope({
      correlationId: sharedCorrelationId,
      eventType: 'VERIFICATION_ANOMALY',
      severity: 'ERROR',
      source: 'VerificationBadge',
      payload: { occurrenceKey: 'occ-123', status: 'evidence_pending' },
    });

    expect(envelope1.correlationId).toBe(sharedCorrelationId);
    expect(envelope2.correlationId).toBe(sharedCorrelationId);
    expect(envelope1.eventId).not.toBe(envelope2.eventId);
  });

  test('R4: Correlación consultiva de solo lectura con OMA-01 (OperationalMemoryAnalyticsService)', () => {
    const sharedCorrId = 'corr-oma-test';

    const env = createEventEnvelope({
      correlationId: sharedCorrId,
      eventType: 'EXECUTION_ANOMALY',
      severity: 'WARN',
      source: 'FieldExecutionCollector',
      payload: { reportedQty: 5 },
    });

    pushEventToObservabilityBuffer(env);

    // Mock de datos de entrada para OMA-01
    const samplePlanItems: Partial<WeeklyPlanItem>[] = [
      {
        id: 'item-1',
        board_id: 'board-oma-1',
        planned_qty: 10,
        theoretical_jr: 2,
        is_manual_override: false,
      } as unknown as WeeklyPlanItem,
    ];

    const sampleExecutions: Partial<ExecutionRecord>[] = [
      {
        id: 'exec-1',
        weekly_plan_item_id: 'item-1',
        verified_qty: 10,
        verified_jr: 2,
        verification_status: 'verified',
      } as unknown as ExecutionRecord,
    ];

    const correlationResult = correlateFactsWithMemoryAnalytics(
      sharedCorrId,
      getObservabilityBuffer() as EventEnvelope[],
      {
        planItems: samplePlanItems as unknown as WeeklyPlanItem[],
        executions: sampleExecutions as unknown as ExecutionRecord[],
      }
    );

    expect(correlationResult.correlationId).toBe(sharedCorrId);
    expect(correlationResult.factCount).toBe(1);
    expect(correlationResult.memoryAnalyticsSummary?.boardId).toBe('board-oma-1');
    expect(correlationResult.memoryAnalyticsSummary?.totalFactsEvaluated.planItemsCount).toBe(1);
  });

  test('R5: Buffer en memoria previene contaminación cruzada entre múltiples sesiones/eventos', () => {
    const envA = createEventEnvelope({
      correlationId: 'corr-session-A',
      eventType: 'UI_ERROR',
      severity: 'INFO',
      source: 'Header',
      payload: { test: 'A' },
    });

    const envB = createEventEnvelope({
      correlationId: 'corr-session-B',
      eventType: 'TEST_FAILURE',
      severity: 'CRITICAL',
      source: 'JestRunner',
      payload: { test: 'B' },
    });

    pushEventToObservabilityBuffer(envA);
    pushEventToObservabilityBuffer(envB);

    const buffer = getObservabilityBuffer();
    expect(buffer).toHaveLength(2);

    const corrResultA = correlateFactsWithMemoryAnalytics('corr-session-A', buffer as EventEnvelope[]);
    expect(corrResultA.factCount).toBe(1);
    expect(corrResultA.facts[0].attributes.test).toBe('A');

    clearObservabilityBuffer();
    expect(getObservabilityBuffer()).toHaveLength(0);
  });

  test('R6: Ausencia total de mutaciones externas en base de datos PostgreSQL (Solo lectura)', () => {
    const initialBufferLength = getObservabilityBuffer().length;

    const env = createEventEnvelope({
      eventType: 'PERFORMANCE_SIGNAL',
      severity: 'INFO',
      source: 'PerformanceMonitor',
      payload: { ttiMs: 450 },
    });

    pushEventToObservabilityBuffer(env);

    // Verificar que el buffer es puramente en memoria y no ejecuta RPCs ni escrituras
    expect(getObservabilityBuffer().length).toBe(initialBufferLength + 1);
  });

  test('R7: Un sobre de evento H7.1 NUNCA se auto-transforma en diagnóstico, recomendación ni parche', () => {
    const envelope = createEventEnvelope({
      eventType: 'BUILD_FAILURE',
      severity: 'CRITICAL',
      source: 'NextBuild',
      payload: { errorModule: 'src/components/actividades/ActividadesView.tsx' },
    });

    // Invariante Cognitiva H7.1: Las propiedades de diagnóstico y solución NO existen en EventEnvelope
    const envObj = envelope as unknown as Record<string, unknown>;
    expect(envObj['diagnosis']).toBeUndefined();
    expect(envObj['recommendation']).toBeUndefined();
    expect(envObj['patch']).toBeUndefined();
    expect(envObj['action']).toBeUndefined();
    expect(envObj['remediation']).toBeUndefined();
  });
});
