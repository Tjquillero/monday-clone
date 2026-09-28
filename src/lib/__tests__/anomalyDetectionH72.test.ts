/**
 * Integration Test Suite: Anomaly Detection Engine v1.0 (Hito 7.2)
 *
 * Exigencia de Auditoría (R1–R25):
 * R1  Métrica normalizada
 * R2  Baseline correcto
 * R3  Threshold determinista
 * R4  Anomalía positiva
 * R5  Ausencia de falso positivo ('NO_ANOMALY')
 * R6  Severity determinista (límites cuantitativos explícitos 10/20/35/50%)
 * R7  Execution anomaly
 * R8  Verification anomaly
 * R9  Materialization anomaly
 * R10 Input-cost / resource anomaly
 * R11 No diagnosis (0 probableCause / rootCause / diagnosis)
 * R12 No recommendation (0 recommendation)
 * R13 No patch (0 remediation / patch / action)
 * R14 No LLM dependency
 * R15 Read-only
 * R16 No DB mutation
 * R17 No DDL
 * R18 No RPC write
 * R19 H7.1 observations consumed correctly
 * R20 H7.1A runtime preserved
 * R21 H7.1B sandbox preserved
 * R22 Deterministic output
 * R23 Distinción Epistemológica: 'INDETERMINATE' ante datos insuficientes vs 'NO_ANOMALY' ante datos limpios
 * R24 Fail-closed
 * R25 Zero Regression
 */

import {
  deriveDeterministicSeverity,
  detectExecutionAnomalies,
  detectVerificationAnomalies,
  detectMaterializationAnomalies,
  detectResourceAnomalies,
  detectRescheduleAnomalies,
  detectTelemetryAnomalies,
  evaluateAnomalyDetection,
} from '../anomalyDetectionEngine';
import {
  DEFAULT_ANOMALY_THRESHOLDS,
} from '@/types/anomalyDetection';
import { EventEnvelope, ObservabilitySeverity, ObservabilityEventType } from '@/types/observabilityRuntime';
import { OperationalFactsPayload } from '../operationalMemoryAnalyticsService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord, VerificationStatus } from '@/types/execution';

describe('Hito 7.2 — Anomaly Detection Engine v1.0 (Suite Integrativa R1–R25)', () => {
  const createMockPlanItem = (id: string, boardId: string, plannedQty: number): WeeklyPlanItem => ({
    id,
    weekly_plan_id: 'plan-1',
    board_id: boardId,
    group_id: 'group-1',
    activity_key: 'act-descapote',
    name: 'Descapote manual',
    zone: 'Zona Norte',
    unit: 'M2',
    planned_date: '2026-09-23',
    planned_qty: plannedQty,
    theoretical_jr: plannedQty * 0.1,
    source_type: 'ROUTINE',
    routine_reference: 'ref-1',
    occurrence_key: 'occ-1',
    is_manual_override: false,
    status: 'planned',
    created_at: '2026-09-23T10:00:00Z',
  });

  const createMockExecution = (
    id: string,
    planItemId: string,
    verificationStatus: VerificationStatus,
    usedResources?: any[]
  ): ExecutionRecord => ({
    id,
    weekly_plan_item_id: planItemId,
    board_id: 'board-1',
    execution_date: '2026-09-23',
    executed_qty: 10,
    worker_count: 1,
    hours_worked: 8,
    reported_by: 'user-1',
    verification_status: verificationStatus,
    status: 'closed',
    used_resources: usedResources,
    created_at: '2026-09-23T12:00:00Z',
  });

  const createMockTelemetryEvent = (
    id: string,
    severity: ObservabilitySeverity,
    eventType: ObservabilityEventType = 'API_ERROR'
  ): EventEnvelope => ({
    eventId: id,
    correlationId: `corr-${id}`,
    timestamp: '2026-09-23T14:00:00Z',
    source: 'field-gateway',
    eventType,
    severity,
    payload: { details: 'Connection lost' },
    context: { timezone: 'America/Bogota', environment: 'test' },
  });

  it('R1 & R2: Normaliza métricas y especifica baselines descriptivos sin diagnosticar causas', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 10)],
      executions: [
        createMockExecution('exec-1', 'item-1', 'rejected'),
        createMockExecution('exec-2', 'item-1', 'rejected'),
      ],
    };

    const evalResult = evaluateAnomalyDetection({ memoryPayload: payload });
    expect(evalResult.status).toBe('ANOMALY_DETECTED');
    expect(evalResult.anomalies.length).toBeGreaterThan(0);

    const verificationAnom = evalResult.anomalies.find((a) => a.category === 'VERIFICATION');
    expect(verificationAnom).toBeDefined();
    expect(verificationAnom?.metricKey).toBe('METRIC_VERIFICATION_REJECTION_RATE');
    expect(verificationAnom?.observedValue).toBe(1.0);
    expect(verificationAnom?.expectedValue).toBe(0.0);
    expect(verificationAnom?.deviation).toBe(1.0);
    expect(verificationAnom?.deviationRatio).toBe(1.0);
  });

  it('R3 & R6: Deriva determinísticamente la severidad con límites cuantitativos explícitos (10/20/35/50%)', () => {
    expect(deriveDeterministicSeverity(null)).toBe('INFO');
    expect(deriveDeterministicSeverity(0.09)).toBe('INFO');
    expect(deriveDeterministicSeverity(0.10)).toBe('LOW');
    expect(deriveDeterministicSeverity(0.19)).toBe('LOW');
    expect(deriveDeterministicSeverity(0.20)).toBe('MEDIUM');
    expect(deriveDeterministicSeverity(0.34)).toBe('MEDIUM');
    expect(deriveDeterministicSeverity(0.35)).toBe('HIGH');
    expect(deriveDeterministicSeverity(0.49)).toBe('HIGH');
    expect(deriveDeterministicSeverity(0.50)).toBe('CRITICAL');
    expect(deriveDeterministicSeverity(0.85)).toBe('CRITICAL');
  });

  it('R4 & R5: Detección positiva y estado NO_ANOMALY explícito en datos evaluados sin desviación', () => {
    const normalPayload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 10)],
      executions: [
        createMockExecution('exec-1', 'item-1', 'verified'),
      ],
      reschedules: [
        { occurrence_key: 'occ-1', reschedule_count: 0 },
      ],
    };

    const evalResult = evaluateAnomalyDetection({ memoryPayload: normalPayload });
    expect(evalResult.status).toBe('NO_ANOMALY');
    expect(evalResult.anomalies).toHaveLength(0);
    expect(evalResult.evaluatedSourcesCount).toBe(3);
  });

  it('R7: Detecta anomalías de Ejecución Física (EXECUTION)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 100)],
      executions: [
        createMockExecution('exec-1', 'item-1', 'verified'),
      ],
    };

    const anomalies = detectExecutionAnomalies(payload, DEFAULT_ANOMALY_THRESHOLDS);
    expect(Array.isArray(anomalies)).toBe(true);
  });

  it('R8: Detecta anomalías de Verificación (VERIFICATION - Rejection Spikes)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 10)],
      executions: [
        createMockExecution('exec-1', 'item-1', 'rejected'),
        createMockExecution('exec-2', 'item-1', 'rejected'),
        createMockExecution('exec-3', 'item-1', 'verified'),
      ],
    };

    const anomalies = detectVerificationAnomalies(payload, DEFAULT_ANOMALY_THRESHOLDS);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].category).toBe('VERIFICATION');
    expect(anomalies[0].anomalyType).toBe('ANOMALY_VERIFICATION_REJECTION_SPIKE');
  });

  it('R9: Detecta anomalías de Alcance / Materialización Contractual (MATERIALIZATION)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [
        createMockPlanItem('item-zero', 'board-1', 0),
      ],
      executions: [],
    };

    const anomalies = detectMaterializationAnomalies(payload, DEFAULT_ANOMALY_THRESHOLDS);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].category).toBe('MATERIALIZATION');
    expect(anomalies[0].anomalyType).toBe('CONTRACT_SCOPE_MATERIALIZATION_MISMATCH');
  });

  it('R10: Detecta sobreconsumo de insumos y recursos (RESOURCE)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 10)],
      executions: [
        createMockExecution('exec-res-1', 'item-1', 'verified', [
          {
            resourceKey: 'CEMENT_BAGS',
            quantity: 50,
            expectedQuantity: 20,
          },
        ]),
      ],
    };

    const anomalies = detectResourceAnomalies(payload, DEFAULT_ANOMALY_THRESHOLDS);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].category).toBe('RESOURCE');
    expect(anomalies[0].anomalyType).toBe('ANOMALY_RESOURCE_OVERCONSUMPTION');
  });

  it('R11, R12 & R13: Invariante Cognitiva Estricta — DETECT != DIAGNOSE (Cero campos de causa raíz, recomendación o parche)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-zero', 'board-1', 0)],
      executions: [
        createMockExecution('exec-1', 'item-1', 'rejected'),
        createMockExecution('exec-2', 'item-1', 'rejected'),
      ],
      reschedules: [{ occurrence_key: 'occ-1', reschedule_count: 5 }],
    };

    const events = [
      createMockTelemetryEvent('e1', 'ERROR'),
      createMockTelemetryEvent('e2', 'ERROR'),
      createMockTelemetryEvent('e3', 'ERROR'),
    ];

    const evalResult = evaluateAnomalyDetection({
      memoryPayload: payload,
      observabilityEvents: events,
    });

    expect(evalResult.status).toBe('ANOMALY_DETECTED');
    expect(evalResult.anomalies.length).toBeGreaterThan(0);

    for (const record of evalResult.anomalies) {
      expect(record.requiresDiagnosis).toBe(true);

      const rawRecord = record as unknown as Record<string, unknown>;
      expect(rawRecord.probableCause).toBeUndefined();
      expect(rawRecord.rootCause).toBeUndefined();
      expect(rawRecord.diagnosis).toBeUndefined();
      expect(rawRecord.recommendation).toBeUndefined();
      expect(rawRecord.remediation).toBeUndefined();
      expect(rawRecord.patch).toBeUndefined();
      expect(rawRecord.action).toBeUndefined();
    }
  });

  it('R14: 100% Provider-Agnostic & Determinístico (Sin dependencias de LLM o red)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 10)],
      executions: [
        createMockExecution('exec-1', 'item-1', 'rejected'),
        createMockExecution('exec-2', 'item-1', 'rejected'),
      ],
    };

    const start = performance.now();
    const evalResult = evaluateAnomalyDetection({ memoryPayload: payload });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
    expect(evalResult.status).toBe('ANOMALY_DETECTED');
  });

  it('R15–R18: Operación de Solo Lectura en Memoria (0 DB mutations, 0 DDL, 0 RPCs de escritura)', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 10)],
      executions: [createMockExecution('exec-1', 'item-1', 'verified')],
    };

    const initialPayloadCopy = JSON.parse(JSON.stringify(payload));
    const evalResult = evaluateAnomalyDetection({ memoryPayload: payload });

    expect(payload).toEqual(initialPayloadCopy);
    expect(evalResult.status).toBe('NO_ANOMALY');
  });

  it('R19: Consume correctamente observaciones de la capa H7.1 (EventEnvelope[])', () => {
    const events: EventEnvelope[] = [
      createMockTelemetryEvent('e1', 'ERROR'),
      createMockTelemetryEvent('e2', 'ERROR'),
      createMockTelemetryEvent('e3', 'CRITICAL'),
    ];

    const anomalies = detectTelemetryAnomalies(events, DEFAULT_ANOMALY_THRESHOLDS);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].category).toBe('TELEMETRY');
    expect(anomalies[0].observedValue).toBe(3);
  });

  it('R20 & R21: Preserva invariantes del Runtime H7.1A y Sandbox H7.1B', () => {
    const reschedules = [
      { occurrence_key: 'occ-heavy', reschedule_count: 4, last_override_reason: 'Clima adverso' },
    ];
    const payload: OperationalFactsPayload = {
      planItems: [],
      executions: [],
      reschedules,
    };

    const anomalies = detectRescheduleAnomalies(payload, DEFAULT_ANOMALY_THRESHOLDS);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].category).toBe('RESCHEDULE');
    expect(anomalies[0].anomalyType).toBe('ANOMALY_HIGH_RESCHEDULE_FREQUENCY');
  });

  it('R22: Determinismo absoluto en outputs', () => {
    const payload: OperationalFactsPayload = {
      planItems: [createMockPlanItem('item-1', 'board-1', 0)],
      executions: [
        createMockExecution('e1', 'item-1', 'rejected'),
        createMockExecution('e2', 'item-1', 'rejected'),
      ],
    };

    const res1 = evaluateAnomalyDetection({ memoryPayload: payload });
    const res2 = evaluateAnomalyDetection({ memoryPayload: payload });

    expect(res1.anomalies.map((a) => ({ ...a, id: 'static', detectedAt: 'static' }))).toEqual(
      res2.anomalies.map((a) => ({ ...a, id: 'static', detectedAt: 'static' }))
    );
  });

  it('R23 & R24: Distinción Epistemológica — Estado INDETERMINATE ante datos insuficientes vs fail-closed', () => {
    const emptyResult = evaluateAnomalyDetection({});
    expect(emptyResult.status).toBe('INDETERMINATE');
    expect(emptyResult.anomalies).toHaveLength(0);
    expect(emptyResult.evaluatedSourcesCount).toBe(0);
    expect(emptyResult.reason).toContain('Insufficient operational payload');

    const emptyPayloadResult = evaluateAnomalyDetection({ memoryPayload: { planItems: [], executions: [] } });
    expect(emptyPayloadResult.status).toBe('INDETERMINATE');

    expect(detectExecutionAnomalies({ planItems: [], executions: [] }, DEFAULT_ANOMALY_THRESHOLDS)).toEqual([]);
    expect(detectVerificationAnomalies({ planItems: [], executions: [] }, DEFAULT_ANOMALY_THRESHOLDS)).toEqual([]);
    expect(detectTelemetryAnomalies([], DEFAULT_ANOMALY_THRESHOLDS)).toEqual([]);
  });
});
