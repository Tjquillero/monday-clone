/**
 * Mantenix - Hito 7.8 Agent Outcome Evaluation & Governed Feedback Engine v1.0
 * Suite de Pruebas Unitarias de Evaluación de Resultados Post-Aplicación
 *
 * Cobertura de Criterios de Aceptación:
 * 1. INCREASE alcanzado (observedDelta >= projectedDelta -> OUTCOME_ACHIEVED)
 * 2. INCREASE no alcanzado (observedDelta < projectedDelta -> OUTCOME_NOT_ACHIEVED)
 * 3. DECREASE alcanzado (observedDelta <= projectedDelta -> OUTCOME_ACHIEVED)
 * 4. DECREASE no alcanzado (observedDelta > projectedDelta -> OUTCOME_NOT_ACHIEVED)
 * 5. Ausencia de observedValue -> OUTCOME_INDETERMINATE
 * 6. Aplicación H7.7 distinta de APPLICATION_SUCCESS -> OUTCOME_INDETERMINATE
 * 7. projectedDelta === 0 -> OUTCOME_INDETERMINATE
 * 8. Dirección inválida -> OUTCOME_INDETERMINATE
 * 9. Incoherencia metricDirection / projectedDelta -> OUTCOME_INDETERMINATE
 * 10. Cálculo exacto de achievementRatio
 * 11. Determinismo estricto de resultados
 * 12. requiresHumanReview === true y timezone === 'America/Bogota'
 * 13. Cero mutaciones de inputs (inmutabilidad)
 * 14. Extracción factual desde postApplicationFacts (H7.1)
 * 15. Falta de baselineValue o expectedOutcome -> OUTCOME_INDETERMINATE
 */

import { evaluateGovernedOutcome } from '../outcomeEvaluationEngine';
import { GovernedApplicationRecord } from '../../types/governedApplication';
import { RepairProposalRecord } from '../../types/repairProposal';
import { ActionPlanRecord } from '../../types/actionPlanning';
import { ObservabilityFactRecord } from '../../types/observabilityRuntime';

describe('H7.8 Outcome Evaluation & Governed Feedback Engine v1.0', () => {
  const baseApplication: GovernedApplicationRecord = {
    applicationId: 'app-uuid-001',
    applicationMutationId: 'mut-001',
    proposalId: 'prop-uuid-001',
    recoveryId: 'rec-uuid-001',
    planId: 'plan-uuid-001',
    targetItemId: 'item-uuid-001',
    targetTable: 'weekly_plan_items',
    actionType: 'PROPOSE_SCHEDULE_OVERRIDE',
    status: 'APPLICATION_SUCCESS',
    policyDecisionUsed: 'ALLOW_SANDBOX',
    isHumanAuthorized: true,
    actorUserId: 'user-supervisor-01',
    actorRole: 'supervisor',
    appliedDiffs: [{ fieldName: 'planned_date', previousValue: '2026-09-21', newValue: '2026-09-22' }],
    beforeSnapshot: { planned_date: '2026-09-21' },
    afterSnapshot: { planned_date: '2026-09-22' },
    appliedAt: '2026-09-24T10:00:00.000Z',
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };

  const baseProposal: RepairProposalRecord = {
    proposalId: 'prop-uuid-001',
    planId: 'plan-uuid-001',
    diagnosticId: 'diag-uuid-001',
    anomalyId: 'anom-uuid-001',
    actionType: 'PROPOSE_SCHEDULE_OVERRIDE',
    targetEntityId: 'item-uuid-001',
    payload: { targetDate: '2026-09-22' },
    expectedOutcome: {
      targetMetric: 'execution_rate',
      projectedDelta: 0.25,
      metricDirection: 'INCREASE',
    },
    status: 'PROPOSAL_GENERATED',
    evaluationTarget: 'SandboxEngine',
    evaluatedAt: '2026-09-24T09:30:00.000Z',
    timezone: 'America/Bogota',
    proposalVersion: 'v1.0',
    requiresHumanReview: true,
  };

  const baseActionPlan: ActionPlanRecord = {
    planId: 'plan-uuid-001',
    diagnosticId: 'diag-uuid-001',
    anomalyId: 'anom-uuid-001',
    status: 'RECOMMENDED',
    primaryRecommendation: {
      candidateId: 'cand-001',
      category: 'ADJUST_MAINTENANCE_SCHEDULE',
      title: 'Ajuste de fecha de mantenimiento',
      rationale: 'Se reprograma para evitar colisión de cuadrilla',
      targetEntityId: 'item-uuid-001',
      expectedImpact: {
        metric: 'execution_rate',
        baselineValue: 0.50,
        projectedValue: 0.75,
        estimatedImprovement: 0.25,
        unit: 'ratio',
        impactConfidenceScore: 0.95,
      },
      riskLevel: 'LOW',
      riskJustification: 'Reprogramación en la misma semana',
      requiresHumanReview: true,
    },
    alternativeRecommendations: [],
    evaluatedAt: '2026-09-24T09:00:00.000Z',
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };

  test('R1: INCREASE alcanzado (observedDelta >= projectedDelta -> OUTCOME_ACHIEVED)', () => {
    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.80, // baseline: 0.50 -> observedDelta = 0.30 >= projectedDelta 0.25
    });

    expect(result.status).toBe('OUTCOME_ACHIEVED');
    expect(result.observedDelta).toBe(0.30);
    expect(result.achievementRatio).toBe(1.2);
    expect(result.reasoning).toContain('OUTCOME_ACHIEVED');
  });

  test('R2: INCREASE no alcanzado (observedDelta < projectedDelta -> OUTCOME_NOT_ACHIEVED)', () => {
    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.60, // baseline: 0.50 -> observedDelta = 0.10 < projectedDelta 0.25
    });

    expect(result.status).toBe('OUTCOME_NOT_ACHIEVED');
    expect(result.observedDelta).toBe(0.10);
    expect(result.achievementRatio).toBe(0.4);
    expect(result.reasoning).toContain('OUTCOME_NOT_ACHIEVED');
  });

  test('R3: DECREASE alcanzado (observedDelta <= projectedDelta -> OUTCOME_ACHIEVED)', () => {
    const decreaseProposal: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'failure_rate',
        projectedDelta: -0.20,
        metricDirection: 'DECREASE',
      },
    };

    const decreasePlan: ActionPlanRecord = {
      ...baseActionPlan,
      primaryRecommendation: {
        ...baseActionPlan.primaryRecommendation!,
        expectedImpact: {
          metric: 'failure_rate',
          baselineValue: 0.40,
          projectedValue: 0.20,
          estimatedImprovement: -0.20,
          unit: 'ratio',
          impactConfidenceScore: 0.90,
        },
      },
    };

    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: decreaseProposal,
      actionPlan: decreasePlan,
      observedValue: 0.15, // baseline: 0.40 -> observedDelta = -0.25 <= projectedDelta -0.20
    });

    expect(result.status).toBe('OUTCOME_ACHIEVED');
    expect(result.observedDelta).toBe(-0.25);
    expect(result.achievementRatio).toBe(1.25);
  });

  test('R4: DECREASE no alcanzado (observedDelta > projectedDelta -> OUTCOME_NOT_ACHIEVED)', () => {
    const decreaseProposal: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'failure_rate',
        projectedDelta: -0.20,
        metricDirection: 'DECREASE',
      },
    };

    const decreasePlan: ActionPlanRecord = {
      ...baseActionPlan,
      primaryRecommendation: {
        ...baseActionPlan.primaryRecommendation!,
        expectedImpact: {
          metric: 'failure_rate',
          baselineValue: 0.40,
          projectedValue: 0.20,
          estimatedImprovement: -0.20,
          unit: 'ratio',
          impactConfidenceScore: 0.90,
        },
      },
    };

    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: decreaseProposal,
      actionPlan: decreasePlan,
      observedValue: 0.35, // baseline: 0.40 -> observedDelta = -0.05 > projectedDelta -0.20
    });

    expect(result.status).toBe('OUTCOME_NOT_ACHIEVED');
    expect(result.observedDelta).toBe(-0.05);
    expect(result.achievementRatio).toBe(0.25);
  });

  test('R5: Ausencia de observedValue -> OUTCOME_INDETERMINATE', () => {
    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: null,
    });

    expect(result.status).toBe('OUTCOME_INDETERMINATE');
    expect(result.observedValue).toBeNull();
    expect(result.observedDelta).toBeNull();
    expect(result.achievementRatio).toBeNull();
    expect(result.reasoning).toContain('INSUFFICIENT_POST_APPLICATION_EVIDENCE');
  });

  test('R6: Aplicación H7.7 distinta de APPLICATION_SUCCESS -> OUTCOME_INDETERMINATE', () => {
    const deniedApp: GovernedApplicationRecord = {
      ...baseApplication,
      status: 'APPLICATION_DENIED',
    };

    const result = evaluateGovernedOutcome({
      application: deniedApp,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.80,
    });

    expect(result.status).toBe('OUTCOME_INDETERMINATE');
    expect(result.reasoning).toContain('APPLICATION_NOT_SUCCESSFUL');
  });

  test('R7: projectedDelta === 0 -> OUTCOME_INDETERMINATE', () => {
    const zeroDeltaProposal: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'execution_rate',
        projectedDelta: 0,
        metricDirection: 'INCREASE',
      },
    };

    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: zeroDeltaProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.80,
    });

    expect(result.status).toBe('OUTCOME_INDETERMINATE');
    expect(result.reasoning).toContain('INVALID_PROJECTED_DELTA');
  });

  test('R8: Dirección inválida -> OUTCOME_INDETERMINATE', () => {
    const invalidDirProposal: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'execution_rate',
        projectedDelta: 0.25,
        metricDirection: 'SIDEWAYS' as any,
      },
    };

    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: invalidDirProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.80,
    });

    expect(result.status).toBe('OUTCOME_INDETERMINATE');
    expect(result.reasoning).toContain('INVALID_METRIC_DIRECTION');
  });

  test('R9: Incoherencia metricDirection / projectedDelta -> OUTCOME_INDETERMINATE', () => {
    // INCREASE con delta negativo
    const incoherentProposal1: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'execution_rate',
        projectedDelta: -0.25,
        metricDirection: 'INCREASE',
      },
    };

    const result1 = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: incoherentProposal1,
      actionPlan: baseActionPlan,
      observedValue: 0.80,
    });

    expect(result1.status).toBe('OUTCOME_INDETERMINATE');
    expect(result1.reasoning).toContain('INCOHERENT_DIRECTION_DELTA');

    // DECREASE con delta positivo
    const incoherentProposal2: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'failure_rate',
        projectedDelta: 0.25,
        metricDirection: 'DECREASE',
      },
    };

    const result2 = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: incoherentProposal2,
      actionPlan: baseActionPlan,
      observedValue: 0.20,
    });

    expect(result2.status).toBe('OUTCOME_INDETERMINATE');
    expect(result2.reasoning).toContain('INCOHERENT_DIRECTION_DELTA');
  });

  test('R10: Cálculo exacto de achievementRatio numérico', () => {
    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.75, // baseline: 0.50 -> observedDelta = 0.25 === projectedDelta -> ratio 1.0
    });

    expect(result.status).toBe('OUTCOME_ACHIEVED');
    expect(result.achievementRatio).toBe(1.0);
  });

  test('R11: Determinismo estricto de resultados excluyendo evaluationId y evaluatedAt', () => {
    const res1 = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.75,
    });

    const res2 = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.75,
    });

    expect(res1.status).toBe(res2.status);
    expect(res1.observedDelta).toBe(res2.observedDelta);
    expect(res1.achievementRatio).toBe(res2.achievementRatio);
    expect(res1.reasoning).toBe(res2.reasoning);
    expect(res1.targetMetric).toBe(res2.targetMetric);
    expect(res1.metricDirection).toBe(res2.metricDirection);
  });

  test('R12: Invariantes de gobernanza (requiresHumanReview === true, timezone === America/Bogota)', () => {
    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.80,
    });

    expect(result.requiresHumanReview).toBe(true);
    expect(result.timezone).toBe('America/Bogota');
    expect(result.evaluatorVersion).toBe('v1.0');
  });

  test('R13: Cero mutaciones en inputs (inmutabilidad estricta)', () => {
    const appCopy = JSON.parse(JSON.stringify(baseApplication));
    const propCopy = JSON.parse(JSON.stringify(baseProposal));
    const planCopy = JSON.parse(JSON.stringify(baseActionPlan));

    evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      observedValue: 0.80,
    });

    expect(baseApplication).toEqual(appCopy);
    expect(baseProposal).toEqual(propCopy);
    expect(baseActionPlan).toEqual(planCopy);
  });

  test('R14: Extracción factual de observedValue desde postApplicationFacts (H7.1)', () => {
    const facts: ObservabilityFactRecord[] = [
      {
        factId: 'fact-001',
        correlationId: 'corr-001',
        factType: 'METRIC_OBSERVATION',
        description: 'Medición post-intervención de ejecución',
        observedAt: '2026-09-24T10:30:00.000Z',
        sourceComponent: 'OperationalMemoryAnalyticsService',
        rawEnvelopeId: 'env-001',
        attributes: {
          execution_rate: 0.85,
        },
      },
    ];

    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: baseActionPlan,
      postApplicationFacts: facts,
    });

    expect(result.status).toBe('OUTCOME_ACHIEVED');
    expect(result.observedValue).toBe(0.85);
    expect(result.observedDelta).toBe(0.35);
  });

  test('R15: Falta de baselineValue o expectedOutcome -> OUTCOME_INDETERMINATE', () => {
    const planWithoutBaseline: ActionPlanRecord = {
      ...baseActionPlan,
      primaryRecommendation: {
        ...baseActionPlan.primaryRecommendation!,
        expectedImpact: {
          ...baseActionPlan.primaryRecommendation!.expectedImpact,
          baselineValue: null as any,
        },
      },
    };

    const result = evaluateGovernedOutcome({
      application: baseApplication,
      proposal: baseProposal,
      actionPlan: planWithoutBaseline,
      observedValue: 0.80,
    });

    expect(result.status).toBe('OUTCOME_INDETERMINATE');
    expect(result.reasoning).toContain('INVALID_BASELINE_VALUE');
  });
});
