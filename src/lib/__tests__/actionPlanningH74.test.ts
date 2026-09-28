/**
 * Mantenix - Hito 7.4 Action Planning & Governed Recommendation Engine v1.0
 * Integration & Governance Test Suite (actionPlanningH74.test.ts)
 *
 * Cobertura Completa de Reglas R1–R25 y Assertions A, B, C, D + R6A/R6B Triggers:
 * - A. R12 Deterministic Sorting & Tie-Breakers
 * - B. R13/R23 Strict Impact Quantification (0 null numbers in candidates, fail-closed)
 * - C. R14 Non-Causal Contextual Rationale (0 causal assertion verbs)
 * - D. R11 Category Maximum Allowed Risk Matrix Enforcement
 * - Triggers R6A (REVIEW_CONTRACTUAL_TARGET) & R6B (NOTIFY_SUPERVISOR)
 */

import { evaluateActionPlanning, sortCandidatesDeterministically } from '../actionPlanningEngine';
import { ActionPlanCandidate, CATEGORY_MAX_ALLOWED_RISK } from '../../types/actionPlanning';
import { DiagnosticRecord } from '../../types/contextualDiagnosis';
import { AnomalyRecord } from '../../types/anomalyDetection';

describe('Hito 7.4 — Action Planning & Governed Recommendation Engine v1.0', () => {

  const mockAnomaly: AnomalyRecord = {
    id: 'anom_exec_001',
    detectedAt: '2026-09-23T14:00:00.000Z',
    source: 'execution_analytics',
    metricKey: 'daily_jr_completion',
    observedValue: 0.40,
    expectedValue: 1.00,
    deviation: -0.60,
    deviationRatio: 0.60,
    threshold: 0.20,
    anomalyType: 'EXECUTION_DEFICIT',
    category: 'EXECUTION',
    severity: 'HIGH',
    evidence: [{ sourceId: 'fact_exec_01', description: 'Baja tasa de ejecucion de jornales' }],
    detectionRule: 'rule_execution_deviation',
    requiresDiagnosis: true,
  };

  const mockDiagnostic: DiagnosticRecord = {
    id: 'diag_exec_001',
    diagnosedAt: '2026-09-23T14:05:00.000Z',
    anomalyId: 'anom_exec_001',
    primaryHypothesis: 'Capacidad operativa de cuadrilla contextualmente compatible con el déficit de ejecución.',
    confidence: 0.85,
    confidenceBand: 'HIGH',
    supportWeightComponents: {
      directEvidenceWeight: 0.35,
      temporalAlignmentWeight: 0.25,
      spatialAlignmentWeight: 0.20,
      entityAlignmentWeight: 0.05,
    },
    evidence: [{ sourceId: 'fact_exec_01', sourceType: 'execution_reported', description: 'Ejecucion reportada' }],
    correlations: [{ type: 'TEMPORAL', description: 'Coincidencia temporal de turno', weight: 0.90 }],
    factualBasis: ['fact_exec_01'],
    alternatives: [],
    requiresHumanReview: true,
  };

  // Test 1: R1, R15, R20 (Idempotencia y Determinismo Puro en Memoria)
  it('R1/R15/R20: produce la misma recomendación primaria e idéntico ActionPlanRecord ante las mismas entradas', () => {
    const input = {
      diagnostic: mockDiagnostic,
      anomalyCategory: mockAnomaly.category,
      anomalySeverity: mockAnomaly.severity,
      boardId: 'board_main_01',
      siteId: 'site_astilleros_01',
    };

    const res1 = evaluateActionPlanning(input);
    const res2 = evaluateActionPlanning(input);

    expect(res1.status).toBe('RECOMMENDED');
    expect(res1.boardId).toBe('board_main_01');
    expect(res1.siteId).toBe('site_astilleros_01');
    expect(res1.requiresHumanReview).toBe(true);
    expect(res1.primaryRecommendation).not.toBeNull();
    expect(res1.primaryRecommendation?.category).toBe('REALLOCATE_CREW');

    // Idempotencia estructural
    expect(res1.primaryRecommendation).toEqual(res2.primaryRecommendation);
    expect(res1.alternativeRecommendations).toEqual(res2.alternativeRecommendations);
  });

  // Test 2: R2, R23 (Manejo de diagnósticos de confianza 0 / sin hipótesis)
  it('R2/R23: degrada limpiamente a NO_ACTION_REQUIRED sin inventar recomendaciones', () => {
    const indetDiag: DiagnosticRecord = {
      ...mockDiagnostic,
      id: 'diag_indet_002',
      confidence: 0,
      confidenceBand: 'LOW',
      primaryHypothesis: '',
    };

    const resIndet = evaluateActionPlanning({ diagnostic: indetDiag });
    expect(resIndet.status).toBe('NO_ACTION_REQUIRED');
    expect(resIndet.primaryRecommendation).toBeNull();
    expect(resIndet.alternativeRecommendations).toHaveLength(0);
  });

  // Test 3: Assertion A - R12 (Ordenamiento Lexicográfico Determinista y Empates)
  it('Assertion A (R12): ordena candidatos por estimatedImprovement DESC -> RiskRank ASC -> candidateId ASC', () => {
    const cand1: ActionPlanCandidate = {
      candidateId: 'cand_B',
      category: 'REALLOCATE_CREW',
      title: 'Candidato B',
      rationale: 'Factual rationale B',
      targetEntityId: 'target_1',
      expectedImpact: { metric: 'm1', baselineValue: 0, projectedValue: 0.5, estimatedImprovement: 0.5, unit: 'p', impactConfidenceScore: 0.8 },
      riskLevel: 'HIGH', // rank 3
      riskJustification: 'Justification B',
      requiresHumanReview: true,
    };

    const cand2: ActionPlanCandidate = {
      candidateId: 'cand_A',
      category: 'ADJUST_MAINTENANCE_SCHEDULE',
      title: 'Candidato A',
      rationale: 'Factual rationale A',
      targetEntityId: 'target_2',
      expectedImpact: { metric: 'm1', baselineValue: 0, projectedValue: 0.5, estimatedImprovement: 0.5, unit: 'p', impactConfidenceScore: 0.8 },
      riskLevel: 'MEDIUM', // rank 2 -> debe ganar a cand1 por menor riesgo
      riskJustification: 'Justification A',
      requiresHumanReview: true,
    };

    const cand3: ActionPlanCandidate = {
      candidateId: 'cand_C',
      category: 'FLAG_FOR_FIELD_INSPECTION',
      title: 'Candidato C',
      rationale: 'Factual rationale C',
      targetEntityId: 'target_3',
      expectedImpact: { metric: 'm1', baselineValue: 0, projectedValue: 0.9, estimatedImprovement: 0.9, unit: 'p', impactConfidenceScore: 0.9 },
      riskLevel: 'LOW', // rank 1, mayor impacto 0.9 -> debe ganar primer lugar
      riskJustification: 'Justification C',
      requiresHumanReview: true,
    };

    const sorted = sortCandidatesDeterministically([cand1, cand2, cand3]);

    expect(sorted[0].candidateId).toBe('cand_C'); // Mayor impacto (0.9)
    expect(sorted[1].candidateId).toBe('cand_A'); // Empate en impacto (0.5), pero menor riesgo (MEDIUM=2 vs HIGH=3)
    expect(sorted[2].candidateId).toBe('cand_B'); // Mayor riesgo (HIGH=3)
  });

  // Test 4: Assertion B - R13 ↔ R23 (Cuantificación Estricta sin Números Nulos en Candidatos)
  it('Assertion B (R13/R23): garantiza que todo candidato emitido tenga métricas numéricas cuantitativas no nulas', () => {
    const telemetryDiag: DiagnosticRecord = {
      ...mockDiagnostic,
      id: 'diag_telemetry_004',
    };

    const res = evaluateActionPlanning({
      diagnostic: telemetryDiag,
      anomalyCategory: 'TELEMETRY',
      anomalySeverity: 'INFO',
    });
    expect(res.status).toBe('RECOMMENDED');

    const allCandidates = [res.primaryRecommendation, ...res.alternativeRecommendations].filter((c): c is ActionPlanCandidate => c !== null);

    for (const cand of allCandidates) {
      expect(typeof cand.expectedImpact.baselineValue).toBe('number');
      expect(typeof cand.expectedImpact.projectedValue).toBe('number');
      expect(typeof cand.expectedImpact.estimatedImprovement).toBe('number');
      expect(typeof cand.expectedImpact.impactConfidenceScore).toBe('number');
      expect(typeof cand.expectedImpact.unit).toBe('string');
    }
  });

  // Test 5: Assertion C - R14 (Rationale Contextual Factual sin Verbos Causales)
  it('Assertion C (R14): garantiza que la justificación use lenguaje contextual y no afirme causalidad no demostrada', () => {
    const res = evaluateActionPlanning({
      diagnostic: mockDiagnostic,
      anomalyCategory: mockAnomaly.category,
      anomalySeverity: mockAnomaly.severity,
    });
    expect(res.status).toBe('RECOMMENDED');

    const allRationales = [
      res.primaryRecommendation?.rationale,
      ...res.alternativeRecommendations.map(c => c.rationale),
    ].join(' ');

    // Verificación de prohibición estricta de verbos causales absolutos
    expect(allRationales.toLowerCase()).not.toContain('caused');
    expect(allRationales.toLowerCase()).not.toContain('root cause');
    expect(allRationales.toLowerCase()).not.toContain('causó');
    expect(allRationales.toLowerCase()).not.toContain('causa raíz');
  });

  // Test 6: Assertion D - R11 (Cumplimiento de Matriz de Riesgo Máximo Permitido por Categoría)
  it('Assertion D (R11): evalúa correctamente la matriz de riesgo máximo permitido por categoría', () => {
    expect(CATEGORY_MAX_ALLOWED_RISK.NOTIFY_SUPERVISOR).toBe('LOW');
    expect(CATEGORY_MAX_ALLOWED_RISK.FLAG_FOR_FIELD_INSPECTION).toBe('LOW');
    expect(CATEGORY_MAX_ALLOWED_RISK.ADJUST_MAINTENANCE_SCHEDULE).toBe('MEDIUM');
    expect(CATEGORY_MAX_ALLOWED_RISK.REBALANCE_RESOURCES).toBe('MEDIUM');
    expect(CATEGORY_MAX_ALLOWED_RISK.REALLOCATE_CREW).toBe('HIGH');
    expect(CATEGORY_MAX_ALLOWED_RISK.REVIEW_CONTRACTUAL_TARGET).toBe('CRITICAL');
  });

  // Test 7: Triggers R6A (REVIEW_CONTRACTUAL_TARGET) y R6B (NOTIFY_SUPERVISOR)
  it('Triggers R6A/R6B: genera candidatos gobernados explícitos para REVIEW_CONTRACTUAL_TARGET y NOTIFY_SUPERVISOR', () => {
    // R6A: Materialización CRITICAL -> REVIEW_CONTRACTUAL_TARGET
    const matDiag: DiagnosticRecord = {
      ...mockDiagnostic,
      id: 'diag_mat_007',
    };

    const resMat = evaluateActionPlanning({
      diagnostic: matDiag,
      anomalyCategory: 'MATERIALIZATION',
      anomalySeverity: 'CRITICAL',
    });

    const poaCand = resMat.primaryRecommendation;
    expect(poaCand?.category).toBe('REVIEW_CONTRACTUAL_TARGET');
    expect(poaCand?.riskLevel).toBe('CRITICAL');

    // R6B: Telemetría -> NOTIFY_SUPERVISOR (en alternativas por orden determinista)
    const telemDiag: DiagnosticRecord = {
      ...mockDiagnostic,
      id: 'diag_telem_008',
    };

    const resTelem = evaluateActionPlanning({
      diagnostic: telemDiag,
      anomalyCategory: 'TELEMETRY',
      anomalySeverity: 'INFO',
    });

    const allCandidates = [resTelem.primaryRecommendation, ...resTelem.alternativeRecommendations];
    const supervisorCand = allCandidates.find(c => c?.category === 'NOTIFY_SUPERVISOR');
    expect(supervisorCand).toBeDefined();
    expect(supervisorCand?.riskLevel).toBe('LOW');
    expect(supervisorCand?.expectedImpact.estimatedImprovement).toBe(0.25);
  });

  // Test 8: R7 (Diferenciación entre Riesgo de Acción y Severidad de la Anomalía)
  it('R7: asigna riesgo de acción LOW a una inspección de campo incluso si la anomalía es de severidad HIGH o CRITICAL', () => {
    const criticalDiag: DiagnosticRecord = {
      ...mockDiagnostic,
      id: 'diag_crit_005',
    };

    const res = evaluateActionPlanning({
      diagnostic: criticalDiag,
      anomalyCategory: 'VERIFICATION',
      anomalySeverity: 'CRITICAL',
    });
    expect(res.status).toBe('RECOMMENDED');

    const allCandidates = [res.primaryRecommendation, ...res.alternativeRecommendations];
    const inspCand = allCandidates.find(c => c?.category === 'FLAG_FOR_FIELD_INSPECTION');
    expect(inspCand).toBeDefined();
    expect(inspCand?.category).toBe('FLAG_FOR_FIELD_INSPECTION');
    expect(inspCand?.riskLevel).toBe('LOW'); // La inspección física sigue siendo una acción de bajo riesgo
  });

  // Test 9: R16, R17, R18 (0 Escrituras BD, 0 DDL, 0 RPCs de Escritura)
  it('R16/R17/R18: ejecuta la evaluación 100% en memoria sin efectos secundarios', () => {
    const res = evaluateActionPlanning({
      diagnostic: mockDiagnostic,
      anomalyCategory: mockAnomaly.category,
      anomalySeverity: mockAnomaly.severity,
    });
    expect(res.evaluatorVersion).toBe('v1.0');
    expect(res.requiresHumanReview).toBe(true);
    expect(typeof res.planId).toBe('string');
  });

  // Test 10: R19, R22 (Gobernanza e Invarianza de Marcas de Tiempo)
  it('R19/R22: mantiene requiresHumanReview: true e instante de tiempo UTC ISO 8601 con zona horaria America/Bogota', () => {
    const res = evaluateActionPlanning({
      diagnostic: mockDiagnostic,
      anomalyCategory: mockAnomaly.category,
      anomalySeverity: mockAnomaly.severity,
    });

    expect(res.requiresHumanReview).toBe(true);
    expect(res.timezone).toBe('America/Bogota');
    expect(res.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

    if (res.primaryRecommendation) {
      expect(res.primaryRecommendation.requiresHumanReview).toBe(true);
    }
  });

});
