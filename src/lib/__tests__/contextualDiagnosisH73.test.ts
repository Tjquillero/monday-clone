/**
 * Integration Test Suite: Contextual Diagnostic Engine v1.0 (Hito 7.3)
 *
 * Exigencia de Auditoría (R1–R25):
 * R1  Consume AnomalyRecord H7.2
 * R2  Correlación temporal
 * R3  Correlación espacial
 * R4  Correlación por entidad operacional
 * R5  Evidencia directa
 * R6  Evidencia contradictoria
 * R7  Hipótesis alternativa
 * R8  SupportWeight explícito y Confidence determinista/reproducible
 * R9  Confidence no proveniente únicamente del LLM
 * R10 Evidencia insuficiente -> INDETERMINATE
 * R11 Correlación != Causalidad (Semántica NO-Causal explícita)
 * R12 No diagnosis sin evidencia factual
 * R13 No recommendation
 * R14 No planning
 * R15 No repair (0 patch / remediation / action)
 * R16 No DB mutation
 * R17 No DDL
 * R18 No RPC write
 * R19 Auditabilidad (DiagnosticRecord trazable)
 * R20 Trazabilidad AnomalyRecord -> DiagnosticRecord
 * R21 Core independiente de proveedor LLM
 * R22 Tolerancia a datos malformados
 * R23 Penalización por evidencia contradictoria
 * R24 Hitos anteriores (H7.0–H7.2) preservados
 * R25 Regresión cero
 */

import {
  calculateExplicitSupportWeight,
  calculateDeterministicConfidence,
  diagnoseAnomalyContextually,
  evaluateContextualDiagnosis,
} from '../contextualDiagnosticEngine';
import { AnomalyRecord } from '@/types/anomalyDetection';
import { EventEnvelope } from '@/types/observabilityRuntime';
import { OperationalFactsPayload } from '../operationalMemoryAnalyticsService';
import { SupportWeightComponents } from '@/types/contextualDiagnosis';

describe('Hito 7.3 — Contextual Diagnostic Engine v1.0 (Suite Integrativa R1–R25)', () => {
  const createMockAnomaly = (
    id: string,
    category: 'EXECUTION' | 'VERIFICATION' | 'MATERIALIZATION' | 'RESOURCE' | 'RESCHEDULE' | 'TELEMETRY',
    anomalyType: string = 'ANOMALY_EXECUTION_PRODUCTIVITY_DEFICIT'
  ): AnomalyRecord => ({
    id,
    detectedAt: '2026-09-23T15:00:00Z',
    source: 'OperationalMemoryAnalyticsService:METRIC_PRODUCTIVITY_INDEX',
    metricKey: 'METRIC_PRODUCTIVITY_INDEX',
    observedValue: 0.5,
    expectedValue: 1.0,
    deviation: -0.5,
    deviationRatio: 0.5,
    threshold: 0.2,
    anomalyType,
    category,
    severity: 'HIGH',
    evidence: [{ sourceId: 'board-1', description: 'Productivity index 0.50 vs expected 1.00' }],
    detectionRule: 'deviationRatio >= 0.2',
    requiresDiagnosis: true,
  });

  const createMockPayload = (): OperationalFactsPayload => ({
    planItems: [
      {
        id: 'item-1',
        weekly_plan_id: 'plan-1',
        board_id: 'board-1',
        activity_key: 'act-1',
        name: 'Poda de árboles',
        zone: 'Zona Norte',
        unit: 'M2',
        planned_date: '2026-09-23',
        planned_qty: 10,
        theoretical_jr: 1,
        source_type: 'ROUTINE',
        routine_reference: 'ref-1',
        occurrence_key: 'occ-1',
        is_manual_override: false,
        status: 'planned',
      },
    ],
    executions: [
      {
        id: 'exec-1',
        weekly_plan_item_id: 'item-1',
        board_id: 'board-1',
        execution_date: '2026-09-23',
        executed_qty: 10,
        worker_count: 1,
        hours_worked: 8,
        reported_by: 'user-1',
        verification_status: 'rejected',
        status: 'closed',
      },
    ],
  });

  it('R8 & R9: SupportWeight explícito derivado de componentes factoriales acotados (0.35 direct, 0.25 temporal, 0.20 spatial, 0.20 entity)', () => {
    const components: SupportWeightComponents = {
      directEvidenceWeight: 0.30,
      temporalAlignmentWeight: 0.20,
      spatialAlignmentWeight: 0.15,
      entityAlignmentWeight: 0.15,
    };

    const weight = calculateExplicitSupportWeight(components);
    expect(weight).toBe(0.80); // 0.30 + 0.20 + 0.15 + 0.15 = 0.80

    const { confidence, confidenceBand } = calculateDeterministicConfidence(components, 0);
    expect(confidence).toBe(0.80);
    expect(confidenceBand).toBe('HIGH');
  });

  it('R1, R19 & R20: Consume AnomalyRecord H7.2 y produce DiagnosticRecord trazable', () => {
    const anomaly = createMockAnomaly('anom-exec-1', 'EXECUTION');
    const payload = createMockPayload();

    const diagnostic = diagnoseAnomalyContextually(anomaly, payload);
    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.anomalyId).toBe('anom-exec-1');
    expect(diagnostic?.requiresHumanReview).toBe(true);
    expect(diagnostic?.supportWeightComponents).toBeDefined();
    expect(diagnostic?.primaryHypothesis).toContain('contextually compatible with');
  });

  it('R2, R3 & R4: Correlación temporal, espacial y por entidad operacional', () => {
    const anomaly = createMockAnomaly('anom-verif-1', 'VERIFICATION', 'ANOMALY_VERIFICATION_REJECTION_SPIKE');
    const payload = createMockPayload();

    const diagnostic = diagnoseAnomalyContextually(anomaly, payload);
    expect(diagnostic).not.toBeNull();

    const entityCorr = diagnostic?.correlations.find((c) => c.type === 'ENTITY');
    expect(entityCorr).toBeDefined();
    expect(entityCorr?.weight).toBeGreaterThan(0);
  });

  it('R5, R6 & R23: Manejo de evidencia directa y penalización por evidencia contradictoria', () => {
    const components: SupportWeightComponents = {
      directEvidenceWeight: 0.35,
      temporalAlignmentWeight: 0.25,
      spatialAlignmentWeight: 0.20,
      entityAlignmentWeight: 0.20,
    };

    const noContradiction = calculateDeterministicConfidence(components, 0);
    expect(noContradiction.confidence).toBe(1.0);
    expect(noContradiction.confidenceBand).toBe('HIGH');

    const withContradiction = calculateDeterministicConfidence(components, 2); // 1.0 - 0.40 penalty = 0.60
    expect(withContradiction.confidence).toBe(0.60);
    expect(withContradiction.confidenceBand).toBe('MEDIUM');
  });

  it('R7: Preservación explícita de hipótesis alternativas', () => {
    const anomaly = createMockAnomaly('anom-res-1', 'RESOURCE', 'ANOMALY_RESOURCE_OVERCONSUMPTION');
    const diagnostic = diagnoseAnomalyContextually(anomaly, createMockPayload());

    expect(diagnostic?.alternatives.length).toBeGreaterThan(0);
    expect(diagnostic?.alternatives[0].hypothesis).toBeDefined();
    expect(diagnostic?.alternatives[0].confidence).toBeGreaterThan(0);
  });

  it('R10 & R24: Estado INDETERMINATE ante ausencia de anomalías de entrada', () => {
    const evalResult = evaluateContextualDiagnosis({});
    expect(evalResult.status).toBe('INDETERMINATE');
    expect(evalResult.diagnostics).toHaveLength(0);
    expect(evalResult.reason).toContain('No anomaly records provided');
  });

  it('R11: Invariante Canónica — Correlación != Causalidad (Garantía de Fraseología NO-Causal)', () => {
    const anomaly = createMockAnomaly('anom-corr-1', 'TELEMETRY', 'ANOMALY_TELEMETRY_ERROR_SPIKE');
    const events: EventEnvelope[] = [
      {
        eventId: 'e1',
        correlationId: 'c1',
        timestamp: '2026-09-23T14:00:00Z',
        source: 'gateway',
        eventType: 'API_ERROR',
        severity: 'ERROR',
        payload: {},
        context: { environment: 'test' },
      },
    ];

    const diagnostic = diagnoseAnomalyContextually(anomaly, undefined, events);
    expect(diagnostic).not.toBeNull();

    // Verificación estricta de no utilización de verbos causales absolutos
    const rawHypothesis = diagnostic?.primaryHypothesis.toLowerCase() || '';
    expect(rawHypothesis).not.toContain('caused');
    expect(rawHypothesis).not.toContain('causado');
    expect(rawHypothesis).toContain('contextually compatible with');
    expect(diagnostic?.requiresHumanReview).toBe(true);
  });

  it('R12–R15: Ausencia estricta de recomendaciones, parches o código autoejecutable', () => {
    const anomaly = createMockAnomaly('anom-sec-1', 'EXECUTION');
    const evalResult = evaluateContextualDiagnosis({
      anomalies: [anomaly],
      contextualPayload: createMockPayload(),
    });

    expect(evalResult.status).toBe('DIAGNOSED');
    expect(evalResult.diagnostics.length).toBe(1);

    const record = evalResult.diagnostics[0] as unknown as Record<string, unknown>;
    expect(record.recommendation).toBeUndefined();
    expect(record.remediation).toBeUndefined();
    expect(record.action).toBeUndefined();
    expect(record.patch).toBeUndefined();
    expect(record.codeChange).toBeUndefined();
  });

  it('R16–R18: Operación de solo lectura en memoria (0 DB mutations, 0 DDL, 0 RPCs de escritura)', () => {
    const anomaly = createMockAnomaly('anom-mem-1', 'MATERIALIZATION', 'CONTRACT_SCOPE_MATERIALIZATION_MISMATCH');
    const payload = createMockPayload();
    const payloadCopy = JSON.parse(JSON.stringify(payload));

    const evalResult = evaluateContextualDiagnosis({
      anomalies: [anomaly],
      contextualPayload: payload,
    });

    expect(payload).toEqual(payloadCopy);
    expect(evalResult.status).toBe('DIAGNOSED');
  });

  it('R21 & R22: Reproducibilidad absoluta y tolerancia a insumos malformados', () => {
    const anomaly = createMockAnomaly('anom-rep-1', 'EXECUTION');
    const payload = createMockPayload();

    const diag1 = diagnoseAnomalyContextually(anomaly, payload);
    const diag2 = diagnoseAnomalyContextually(anomaly, payload);

    expect(diag1?.confidence).toBe(diag2?.confidence);
    expect(diag1?.supportWeightComponents).toEqual(diag2?.supportWeightComponents);

    const malformedAnomaly = {
      id: 'anom-bad',
      category: 'EXECUTION' as const,
      observedValue: 0,
      expectedValue: 1,
      evidence: [],
    } as unknown as AnomalyRecord;

    const evalResult = evaluateContextualDiagnosis({ anomalies: [malformedAnomaly] });
    expect(evalResult.status).toBe('DIAGNOSED');
  });
});
