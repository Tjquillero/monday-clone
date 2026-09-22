/**
 * Test Suite: Outcome Evaluation Service (EVAL-01 to EVAL-12)
 *
 * Cobertura:
 * - EVAL-01: R-01 EFFECTIVE con IP >= 0.90 o Delta IP >= +0.20 (N_post >= 3)
 * - EVAL-02: R-02 EFFECTIVE con criterio AND (CV_post < 0.15 AND Delta CV >= 40%)
 * - EVAL-03: R-03 EFFECTIVE con convergencia evaluada estrictamente por resourceKey
 * - EVAL-04: R-04 EFFECTIVE con 100% de ocurrencias post con overrun = 0 (N_post >= 3)
 * - EVAL-05: Muestra post < 3 produce INCONCLUSIVE con INSUFFICIENT_POST_SAMPLE_SIZE
 * - EVAL-06: R-02 con < 2 cuadrillas o < 2 ejecuciones por cuadrilla produce INCONCLUSIVE
 * - EVAL-07: No-aplicabilidad en decisiones REJECTED, POSTPONED o acciones fallidas
 * - EVAL-08: Trazabilidad y versionado inmutable de cohortDefinitionVersion = 'COHORT_V1.0'
 * - EVAL-09: Versionado inmutable de reglas (R01_IP_TARGET_OR_DELTA@v1.0, etc.)
 * - EVAL-10: Cálculo temporal en días operativos hábiles (ADR-0007 / America/Bogota)
 * - EVAL-11: Separación estricta pre/post: Cero contaminación entre cohortes
 * - EVAL-12: Presencia mandatoria de causalDisclaimer en todos los registros
 */

import {
  OutcomeEvaluationService,
  VerifiedExecutionFact,
  addOperationalWorkingDays,
  isOperationalWorkingDay,
} from '../outcomeEvaluationService';
import { DecisionRecord } from '../../types/decisionGovernance';
import { OperationalRecommendation } from '../../types/operationalAdvisory';

describe('Outcome Evaluation Service — Suite EVAL-01 a EVAL-12', () => {
  const baseRec: OperationalRecommendation = {
    recommendationId: 'rec_test_eval',
    recommendationKey: 'R-01_AJUSTE_RENDIMIENTO',
    priority: 'HIGH',
    status: 'PROPOSED',
    scope: { scopeType: 'ACTIVITY', scopeId: 'poda_arboles' },
    triggeredPatternKey: 'P-01_SYSTEMATIC_UNDERESTIMATION',
    targetEntity: { entityType: 'ACTIVITY', entityId: 'poda_arboles' },
    sampleSize: 6,
    confidenceScore: 0.9,
    rationale: 'IP bajo',
    supportingMetrics: [],
    proposedAction: {
      actionType: 'ADVISE_STANDARD_REVISION',
      targetEntity: { entityType: 'ACTIVITY', entityId: 'poda_arboles' },
      suggestedParameters: { proposedStandardRate: 150 },
      applicableDomainGateway: 'poaService',
    },
    projectedImpact: {
      metricKey: 'METRIC_PRODUCTIVITY_INDEX',
      currentObservedValue: 0.7,
      proposedTargetValue: 1.0,
      projectedValue: null,
      unit: 'adimensional',
      expectedImprovementDescription: 'Efectividad',
    },
    generatedAtIso: '2026-09-01T10:00:00.000Z',
  };

  const createDecisionRecord = (overrides?: Partial<DecisionRecord>): DecisionRecord => ({
    id: 'dec_eval_01',
    decisionMutationId: 'mut_eval_01',
    recommendationId: baseRec.recommendationId,
    recommendationKey: baseRec.recommendationKey,
    decisionSequenceNumber: 1,
    boardId: 'board_01',
    actorUserId: 'user_admin',
    actorRole: 'admin',
    decisionStatus: 'ACCEPTED',
    decisionReason: 'Aprobado',
    postponedUntilIso: null,
    decisionTimestamp: '2026-09-01T10:00:00.000Z',
    recommendationSnapshot: baseRec,
    actionStatus: 'EXECUTED',
    executionSnapshot: {
      actionType: 'ADVISE_STANDARD_REVISION',
      activityKey: 'poda_arboles',
      previousStandardRate: 200,
      confirmedUpdatedRate: 150,
      appliedAtIso: '2026-09-01T10:00:00.000Z',
    },
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  });

  test('EVAL-01: R-01 EFFECTIVE con IP_post >= 0.90 o Delta IP >= +0.20 (N_post >= 3)', () => {
    const decision = createDecisionRecord();

    const executions: VerifiedExecutionFact[] = [
      // Baseline (Pre: antes del 01 de Sept)
      { executionId: 'e1', occurrenceKey: 'occ1', activityKey: 'poda_arboles', reportedDate: '2026-08-20', verifiedQty: 70, verifiedJr: 1, theoreticalJr: 0.7, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e2', occurrenceKey: 'occ2', activityKey: 'poda_arboles', reportedDate: '2026-08-25', verifiedQty: 70, verifiedJr: 1, theoreticalJr: 0.7, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e3', occurrenceKey: 'occ3', activityKey: 'poda_arboles', reportedDate: '2026-08-28', verifiedQty: 70, verifiedJr: 1, theoreticalJr: 0.7, plannedQty: 100, verificationStatus: 'verified' },
      // Post (Después de lag de 2 días hábiles: a partir del 04 de Sept)
      { executionId: 'e4', occurrenceKey: 'occ4', activityKey: 'poda_arboles', reportedDate: '2026-09-08', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e5', occurrenceKey: 'occ5', activityKey: 'poda_arboles', reportedDate: '2026-09-10', verifiedQty: 92, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e6', occurrenceKey: 'occ6', activityKey: 'poda_arboles', reportedDate: '2026-09-15', verifiedQty: 96, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    expect(result.evaluationStatus).toBe('EFFECTIVE');
    expect(result.ruleVersion).toBe('R01_IP_TARGET_OR_DELTA@v1.0');
    expect(result.metricComparison.postObservedValue).toBeGreaterThanOrEqual(0.90);
    expect(result.sampleMetrics.postSampleSize).toBe(3);
  });

  test('EVAL-02: R-02 EFFECTIVE con criterio AND (CV_post < 0.15 AND Delta CV >= 40%)', () => {
    const recR02: OperationalRecommendation = {
      ...baseRec,
      recommendationKey: 'R-02_BALANCE_CUADRILLA',
      scope: { scopeType: 'ACTIVITY', scopeId: 'limpieza' },
      targetEntity: { entityType: 'CREW', entityId: 'crew_01' },
      proposedAction: {
        actionType: 'ADVISE_CREW_REALLOCATION',
        targetEntity: { entityType: 'CREW', entityId: 'crew_01' },
        suggestedParameters: { proposedTargetCrewId: 'crew_02' },
        applicableDomainGateway: 'crewAssignmentService',
      },
    };

    const decision = createDecisionRecord({
      recommendationKey: 'R-02_BALANCE_CUADRILLA',
      recommendationSnapshot: recR02,
    });

    const executions: VerifiedExecutionFact[] = [
      // Pre (Alta dispersión entre cuadrillas: crew_A = 50, crew_B = 100 -> CV ~ 0.33)
      { executionId: 'e1', occurrenceKey: 'occ1', activityKey: 'limpieza', crewId: 'crew_A', reportedDate: '2026-08-20', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e2', occurrenceKey: 'occ2', activityKey: 'limpieza', crewId: 'crew_A', reportedDate: '2026-08-21', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e3', occurrenceKey: 'occ3', activityKey: 'limpieza', crewId: 'crew_B', reportedDate: '2026-08-20', verifiedQty: 100, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e4', occurrenceKey: 'occ4', activityKey: 'limpieza', crewId: 'crew_B', reportedDate: '2026-08-21', verifiedQty: 100, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      // Post (Baja dispersión: crew_A = 88, crew_B = 92 -> CV < 0.05, reducción > 40%)
      { executionId: 'e5', occurrenceKey: 'occ5', activityKey: 'limpieza', crewId: 'crew_A', reportedDate: '2026-09-05', verifiedQty: 88, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e6', occurrenceKey: 'occ6', activityKey: 'limpieza', crewId: 'crew_A', reportedDate: '2026-09-06', verifiedQty: 88, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e7', occurrenceKey: 'occ7', activityKey: 'limpieza', crewId: 'crew_B', reportedDate: '2026-09-05', verifiedQty: 92, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e8', occurrenceKey: 'occ8', activityKey: 'limpieza', crewId: 'crew_B', reportedDate: '2026-09-06', verifiedQty: 92, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    expect(result.evaluationStatus).toBe('EFFECTIVE');
    expect(result.ruleVersion).toBe('R02_CREW_CV_REDUCTION_AND_THRESHOLD@v1.0');
    expect(result.metricComparison.postObservedValue).toBeLessThan(0.15);
  });

  test('EVAL-03: R-03 EFFECTIVE con convergencia evaluada estrictamente por resourceKey', () => {
    const recR03: OperationalRecommendation = {
      ...baseRec,
      recommendationKey: 'R-03_PROVISION_INSUMOS',
      scope: { scopeType: 'ACTIVITY', scopeId: 'siembra' },
      targetEntity: { entityType: 'RESOURCE', entityId: 'MAT_FERTILIZANTE' },
      proposedAction: {
        actionType: 'ADVISE_RESOURCE_TEMPLATE_UPDATE',
        targetEntity: { entityType: 'RESOURCE', entityId: 'MAT_FERTILIZANTE' },
        suggestedParameters: { proposedUnitQuota: 2.5 },
        applicableDomainGateway: 'weeklyPlanService',
      },
    };

    const decision = createDecisionRecord({
      recommendationKey: 'R-03_PROVISION_INSUMOS',
      recommendationSnapshot: recR03,
    });

    const executions: VerifiedExecutionFact[] = [
      // Pre (Desviación fuerte: +50% de fertilizante)
      { executionId: 'e1', occurrenceKey: 'o1', activityKey: 'siembra', reportedDate: '2026-08-20', verifiedQty: 10, verifiedJr: 1, theoreticalJr: 1, plannedQty: 10, verificationStatus: 'verified', usedResources: [{ resourceKey: 'MAT_FERTILIZANTE', usedQty: 15, requiredQty: 10 }] },
      { executionId: 'e2', occurrenceKey: 'o2', activityKey: 'siembra', reportedDate: '2026-08-21', verifiedQty: 10, verifiedJr: 1, theoreticalJr: 1, plannedQty: 10, verificationStatus: 'verified', usedResources: [{ resourceKey: 'MAT_FERTILIZANTE', usedQty: 15, requiredQty: 10 }] },
      { executionId: 'e3', occurrenceKey: 'o3', activityKey: 'siembra', reportedDate: '2026-08-22', verifiedQty: 10, verifiedJr: 1, theoreticalJr: 1, plannedQty: 10, verificationStatus: 'verified', usedResources: [{ resourceKey: 'MAT_FERTILIZANTE', usedQty: 15, requiredQty: 10 }] },
      // Post (Convergencia dentro del 5%: used = 10.2 vs req = 10)
      { executionId: 'e4', occurrenceKey: 'o4', activityKey: 'siembra', reportedDate: '2026-09-05', verifiedQty: 10, verifiedJr: 1, theoreticalJr: 1, plannedQty: 10, verificationStatus: 'verified', usedResources: [{ resourceKey: 'MAT_FERTILIZANTE', usedQty: 10.2, requiredQty: 10 }] },
      { executionId: 'e5', occurrenceKey: 'o5', activityKey: 'siembra', reportedDate: '2026-09-06', verifiedQty: 10, verifiedJr: 1, theoreticalJr: 1, plannedQty: 10, verificationStatus: 'verified', usedResources: [{ resourceKey: 'MAT_FERTILIZANTE', usedQty: 10.1, requiredQty: 10 }] },
      { executionId: 'e6', occurrenceKey: 'o6', activityKey: 'siembra', reportedDate: '2026-09-07', verifiedQty: 10, verifiedJr: 1, theoreticalJr: 1, plannedQty: 10, verificationStatus: 'verified', usedResources: [{ resourceKey: 'MAT_FERTILIZANTE', usedQty: 10.0, requiredQty: 10 }] },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    expect(result.evaluationStatus).toBe('EFFECTIVE');
    expect(result.ruleVersion).toBe('R03_RESOURCE_VARIANCE_CONVERGENCE@v1.0');
    expect(result.cohort.selectionCriteria.resourceKey).toBe('MAT_FERTILIZANTE');
  });

  test('EVAL-04: R-04 EFFECTIVE con 100% de ocurrencias post con overrun = 0 (N_post >= 3)', () => {
    const recR04: OperationalRecommendation = {
      ...baseRec,
      recommendationKey: 'R-04_DESDOBLAMIENTO_MULTIDIA',
      scope: { scopeType: 'ACTIVITY', scopeId: 'poda' },
      targetEntity: { entityType: 'ACTIVITY', entityId: 'poda' },
      proposedAction: {
        actionType: 'ADVISE_MULTIDAY_PLANNING',
        targetEntity: { entityType: 'ACTIVITY', entityId: 'poda' },
        suggestedParameters: { proposedPlannedDays: 2 },
        applicableDomainGateway: 'weeklyPlanService',
      },
    };

    const decision = createDecisionRecord({
      recommendationKey: 'R-04_DESDOBLAMIENTO_MULTIDIA',
      recommendationSnapshot: recR04,
    });

    const executions: VerifiedExecutionFact[] = [
      // Pre: 3 ocurrencias con overrun de 1 día (planificada 1 día, ejecutada en 2 días)
      { executionId: 'e1', occurrenceKey: 'occ_pre1', activityKey: 'poda', reportedDate: '2026-08-10', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e2', occurrenceKey: 'occ_pre1', activityKey: 'poda', reportedDate: '2026-08-11', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e3', occurrenceKey: 'occ_pre2', activityKey: 'poda', reportedDate: '2026-08-15', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e4', occurrenceKey: 'occ_pre2', activityKey: 'poda', reportedDate: '2026-08-16', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e5', occurrenceKey: 'occ_pre3', activityKey: 'poda', reportedDate: '2026-08-20', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e6', occurrenceKey: 'occ_pre3', activityKey: 'poda', reportedDate: '2026-08-21', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      // Post: 3 ocurrencias desdobladas formalmente en 2 días, ejecutadas exactamente en 2 días (overrun = 0)
      { executionId: 'e7', occurrenceKey: 'occ_post1', activityKey: 'poda', reportedDate: '2026-09-05', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e8', occurrenceKey: 'occ_post1', activityKey: 'poda', reportedDate: '2026-09-06', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e9', occurrenceKey: 'occ_post2', activityKey: 'poda', reportedDate: '2026-09-10', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e10', occurrenceKey: 'occ_post2', activityKey: 'poda', reportedDate: '2026-09-11', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e11', occurrenceKey: 'occ_post3', activityKey: 'poda', reportedDate: '2026-09-15', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e12', occurrenceKey: 'occ_post3', activityKey: 'poda', reportedDate: '2026-09-16', verifiedQty: 50, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    expect(result.evaluationStatus).toBe('EFFECTIVE');
    expect(result.ruleVersion).toBe('R04_UNPLANNED_OVERRUN_ELIMINATION@v1.0');
    expect(result.sampleMetrics.postSampleSize).toBe(3);
  });

  test('EVAL-05: Muestra post < 3 produce INCONCLUSIVE con INSUFFICIENT_POST_SAMPLE_SIZE', () => {
    const decision = createDecisionRecord();
    const executions: VerifiedExecutionFact[] = [
      { executionId: 'e1', occurrenceKey: 'occ1', activityKey: 'poda_arboles', reportedDate: '2026-09-10', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    expect(result.evaluationStatus).toBe('INCONCLUSIVE');
    expect(result.inconclusiveReason).toBe('INSUFFICIENT_POST_SAMPLE_SIZE');
  });

  test('EVAL-06: R-02 con < 2 cuadrillas produce INCONCLUSIVE con INSUFFICIENT_CREW_COUNT', () => {
    const recR02: OperationalRecommendation = {
      ...baseRec,
      recommendationKey: 'R-02_BALANCE_CUADRILLA',
      scope: { scopeType: 'ACTIVITY', scopeId: 'limpieza' },
      targetEntity: { entityType: 'CREW', entityId: 'crew_01' },
    };

    const decision = createDecisionRecord({
      recommendationKey: 'R-02_BALANCE_CUADRILLA',
      recommendationSnapshot: recR02,
    });

    const executions: VerifiedExecutionFact[] = [
      { executionId: 'e1', occurrenceKey: 'occ1', activityKey: 'limpieza', crewId: 'crew_SOLA', reportedDate: '2026-09-05', verifiedQty: 90, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e2', occurrenceKey: 'occ2', activityKey: 'limpieza', crewId: 'crew_SOLA', reportedDate: '2026-09-06', verifiedQty: 90, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e3', occurrenceKey: 'occ3', activityKey: 'limpieza', crewId: 'crew_SOLA', reportedDate: '2026-09-07', verifiedQty: 90, verifiedJr: 1, theoreticalJr: 1, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    expect(result.evaluationStatus).toBe('INCONCLUSIVE');
    expect(result.inconclusiveReason).toBe('INSUFFICIENT_CREW_COUNT');
  });

  test('EVAL-07: No-aplicabilidad en decisiones REJECTED, POSTPONED o acciones fallidas', () => {
    const decRejected = createDecisionRecord({ decisionStatus: 'REJECTED' });
    const resRej = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decRejected, executions: [] });
    expect(resRej.evaluationStatus).toBe('NOT_APPLICABLE');
    expect(resRej.nonApplicableReason).toBe('DECISION_REJECTED');

    const decPostponed = createDecisionRecord({ decisionStatus: 'POSTPONED' });
    const resPost = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decPostponed, executions: [] });
    expect(resPost.evaluationStatus).toBe('NOT_APPLICABLE');
    expect(resPost.nonApplicableReason).toBe('DECISION_POSTPONED');

    const decFailed = createDecisionRecord({ actionStatus: 'EXECUTION_FAILED' });
    const resFailed = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decFailed, executions: [] });
    expect(resFailed.evaluationStatus).toBe('NOT_APPLICABLE');
    expect(resFailed.nonApplicableReason).toBe('ACTION_EXECUTION_FAILED');
  });

  test('EVAL-08, EVAL-09, EVAL-11 & EVAL-12: Trazabilidad, Versionado, Aislamiento y Disclaimer Causal', () => {
    const decision = createDecisionRecord();
    const executions: VerifiedExecutionFact[] = [
      { executionId: 'e_pre', occurrenceKey: 'occ_pre', activityKey: 'poda_arboles', reportedDate: '2026-08-20', verifiedQty: 70, verifiedJr: 1, theoreticalJr: 0.7, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e_post1', occurrenceKey: 'occ_post1', activityKey: 'poda_arboles', reportedDate: '2026-09-10', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e_post2', occurrenceKey: 'occ_post2', activityKey: 'poda_arboles', reportedDate: '2026-09-11', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
      { executionId: 'e_post3', occurrenceKey: 'occ_post3', activityKey: 'poda_arboles', reportedDate: '2026-09-12', verifiedQty: 95, verifiedJr: 1, theoreticalJr: 1.0, plannedQty: 100, verificationStatus: 'verified' },
    ];

    const result = OutcomeEvaluationService.evaluateOutcome({ decisionRecord: decision, executions });

    // EVAL-08: Cohort version
    expect(result.cohort.cohortDefinitionVersion).toBe('COHORT_V1.0');
    // EVAL-09: Rule version
    expect(result.ruleVersion).toBe('R01_IP_TARGET_OR_DELTA@v1.0');
    // EVAL-11: Cero contaminación pre/post
    expect(result.cohort.baselineExecutionIds).toEqual(['e_pre']);
    expect(result.cohort.postExecutionIds).toEqual(['e_post1', 'e_post2', 'e_post3']);
    // EVAL-12: Causal disclaimer
    expect(result.causalDisclaimer).toBe('Observed delta reflects empirical difference between cohorts; does not constitute inductive causal proof.');
  });

  test('EVAL-10: Cálculo temporal exacto en días hábiles (ADR-0007 / America/Bogota)', () => {
    // Viernes 2026-09-11 + 1 día operativo hábil debe saltar fin de semana (12 y 13) y ser Lunes 2026-09-14
    const nextWorkingDay = addOperationalWorkingDays('2026-09-11', 1);
    expect(nextWorkingDay).toBe('2026-09-14');
    expect(isOperationalWorkingDay('2026-09-12')).toBe(false); // Sábado
    expect(isOperationalWorkingDay('2026-09-13')).toBe(false); // Domingo
    expect(isOperationalWorkingDay('2026-09-14')).toBe(true);  // Lunes
  });
});
