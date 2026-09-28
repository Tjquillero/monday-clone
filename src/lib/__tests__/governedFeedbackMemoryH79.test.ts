/**
 * Mantenix - Hito 7.9 Governed Feedback Memory & Derived Telemetry Bridge v1.0
 * Suite de Pruebas Unitarias de Memoria de Feedback y Proyección Derivada
 *
 * Cobertura de Criterios de Aceptación (R1 a R17):
 * R1: Join válido H7.8 <-> H7.5
 * R2: Join inválido (proposalId mismatch) -> fail-closed con CONTRACT_JOIN_MISMATCH
 * R3: Proyección DERIVED_OUTCOME_EVALUATION_FACT estructurada
 * R4: Proveniencia explícita H7.8_OUTCOME_EVALUATION e isDerivedFact: true
 * R5: No mutación de objetos input (inmutabilidad estricta)
 * R6: Cohorte cuádruple: misma tupla pertenece a la misma cohorte; diferencia produce cohorte distinta
 * R7: Conteo exacto achievedCount
 * R8: Conteo exacto notAchievedCount
 * R9: Conteo exacto indeterminateCount
 * R10: Conteo exacto evaluatedCount = achievedCount + notAchievedCount
 * R11: Cálculo exacto empiricalSuccessRate = achievedCount / evaluatedCount
 * R12: Cohorte sin evaluaciones válidas -> empiricalSuccessRate = null
 * R13: Determinismo estricto de resultados agregados
 * R14: Paridad estricta de planId (evaluation.planId === proposal.planId)
 * R15: Ausencia de lenguaje causal (terminología descriptiva)
 * R16: Memoria volátil de sesión (Buffer no persistente)
 * R17: Principio de no-autorización (requiresHumanReview === true y semántica consultiva)
 */

import {
  projectOutcomeEvaluationToFact,
  generateCohortKey,
  aggregateFeedbackCohorts,
  evaluateHistoricalFeedbackReport,
  GovernedFeedbackMemoryBuffer,
} from '../governedFeedbackMemoryService';
import { OutcomeEvaluationRecord } from '../../types/agentOutcomeEvaluation';
import { RepairProposalRecord } from '../../types/repairProposal';
import { PairedEvaluationInput } from '../../types/governedFeedbackMemory';

describe('H7.9 Governed Feedback Memory & Derived Telemetry Bridge v1.0', () => {
  const baseProposal: RepairProposalRecord = {
    proposalId: 'prop-uuid-101',
    planId: 'plan-uuid-201',
    diagnosticId: 'diag-uuid-301',
    anomalyId: 'anom-uuid-401',
    actionType: 'PROPOSE_SCHEDULE_OVERRIDE',
    targetEntityId: 'site-barranquilla-norte',
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

  const baseEvaluation: OutcomeEvaluationRecord = {
    evaluationId: 'eval-uuid-001',
    applicationId: 'app-uuid-001',
    applicationMutationId: 'mut-001',
    proposalId: 'prop-uuid-101',
    planId: 'plan-uuid-201',
    targetMetric: 'execution_rate',
    metricDirection: 'INCREASE',
    baselineValue: 0.50,
    projectedValue: 0.75,
    projectedDelta: 0.25,
    observedValue: 0.80,
    observedDelta: 0.30,
    achievementRatio: 1.20,
    status: 'OUTCOME_ACHIEVED',
    reasoning: 'OUTCOME_ACHIEVED: Observed delta exceeds projected increase',
    evaluatedAt: '2026-09-24T10:00:00.000Z',
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };

  test('R1: Join válido H7.8 <-> H7.5 proyecta correctamente el hecho derivado', () => {
    const fact = projectOutcomeEvaluationToFact(baseEvaluation, baseProposal);

    expect(fact.factId).toBe('derived-fact-eval-uuid-001');
    expect(fact.correlationId).toBe('plan-uuid-201');
    expect(fact.factType).toBe('DERIVED_OUTCOME_EVALUATION_FACT');
    expect(fact.sourceComponent).toBe('GovernedFeedbackMemoryService_v1.0');
    expect(fact.attributes.actionType).toBe('PROPOSE_SCHEDULE_OVERRIDE');
    expect(fact.attributes.targetEntityId).toBe('site-barranquilla-norte');
    expect(fact.attributes.targetMetric).toBe('execution_rate');
    expect(fact.attributes.evaluationStatus).toBe('OUTCOME_ACHIEVED');
  });

  test('R2: Join inválido (proposalId mismatch) -> fail-closed con CONTRACT_JOIN_MISMATCH', () => {
    const mismatchProposal: RepairProposalRecord = {
      ...baseProposal,
      proposalId: 'prop-uuid-999-mismatch',
    };

    expect(() => {
      projectOutcomeEvaluationToFact(baseEvaluation, mismatchProposal);
    }).toThrow('CONTRACT_JOIN_MISMATCH');
  });

  test('R3: Proyección DERIVED_OUTCOME_EVALUATION_FACT estructurada sin pérdida de atributos', () => {
    const fact = projectOutcomeEvaluationToFact(baseEvaluation, baseProposal);

    expect(fact.attributes.baselineValue).toBe(0.50);
    expect(fact.attributes.projectedDelta).toBe(0.25);
    expect(fact.attributes.observedValue).toBe(0.80);
    expect(fact.attributes.observedDelta).toBe(0.30);
    expect(fact.attributes.achievementRatio).toBe(1.20);
    expect(fact.attributes.requiresHumanReview).toBe(true);
  });

  test('R4: Proveniencia explícita H7.8_OUTCOME_EVALUATION e isDerivedFact: true', () => {
    const fact = projectOutcomeEvaluationToFact(baseEvaluation, baseProposal);

    expect(fact.attributes.isDerivedFact).toBe(true);
    expect(fact.attributes.provenance).toBe('H7.8_OUTCOME_EVALUATION');
  });

  test('R5: No mutación de objetos input (inmutabilidad estricta)', () => {
    const evalCopy = JSON.parse(JSON.stringify(baseEvaluation));
    const propCopy = JSON.parse(JSON.stringify(baseProposal));

    projectOutcomeEvaluationToFact(baseEvaluation, baseProposal);

    expect(baseEvaluation).toEqual(evalCopy);
    expect(baseProposal).toEqual(propCopy);
  });

  test('R6: Cohorte cuádruple: misma tupla pertenece a la misma cohorte; diferencia produce cohorte distinta', () => {
    const eval2: OutcomeEvaluationRecord = {
      ...baseEvaluation,
      evaluationId: 'eval-uuid-002',
      proposalId: 'prop-uuid-102',
      status: 'OUTCOME_NOT_ACHIEVED',
      observedValue: 0.60,
      observedDelta: 0.10,
      achievementRatio: 0.40,
    };
    const prop2: RepairProposalRecord = {
      ...baseProposal,
      proposalId: 'prop-uuid-102',
    };

    const evalDifferentEntity: OutcomeEvaluationRecord = {
      ...baseEvaluation,
      evaluationId: 'eval-uuid-003',
      proposalId: 'prop-uuid-103',
    };
    const propDifferentEntity: RepairProposalRecord = {
      ...baseProposal,
      proposalId: 'prop-uuid-103',
      targetEntityId: 'site-cartagena-sur',
    };

    const summaries = aggregateFeedbackCohorts([
      { evaluation: baseEvaluation, proposal: baseProposal },
      { evaluation: eval2, proposal: prop2 },
      { evaluation: evalDifferentEntity, proposal: propDifferentEntity },
    ]);

    expect(summaries.length).toBe(2);
    // Primera cohorte: site-barranquilla-norte (2 evaluaciones)
    const barranquillaCohort = summaries.find((s) => s.targetEntityId === 'site-barranquilla-norte');
    expect(barranquillaCohort).toBeDefined();
    expect(barranquillaCohort!.totalEvaluations).toBe(2);

    // Segunda cohorte: site-cartagena-sur (1 evaluación)
    const cartagenaCohort = summaries.find((s) => s.targetEntityId === 'site-cartagena-sur');
    expect(cartagenaCohort).toBeDefined();
    expect(cartagenaCohort!.totalEvaluations).toBe(1);
  });

  test('R7, R8, R9, R10, R11: Conteo exacto y cálculo de empiricalSuccessRate', () => {
    const pairAchieved1: PairedEvaluationInput = {
      evaluation: { ...baseEvaluation, evaluationId: 'e1', proposalId: 'p1', status: 'OUTCOME_ACHIEVED', achievementRatio: 1.0 },
      proposal: { ...baseProposal, proposalId: 'p1' },
    };
    const pairAchieved2: PairedEvaluationInput = {
      evaluation: { ...baseEvaluation, evaluationId: 'e2', proposalId: 'p2', status: 'OUTCOME_ACHIEVED', achievementRatio: 1.2 },
      proposal: { ...baseProposal, proposalId: 'p2' },
    };
    const pairNotAchieved: PairedEvaluationInput = {
      evaluation: { ...baseEvaluation, evaluationId: 'e3', proposalId: 'p3', status: 'OUTCOME_NOT_ACHIEVED', achievementRatio: 0.4 },
      proposal: { ...baseProposal, proposalId: 'p3' },
    };
    const pairIndeterminate: PairedEvaluationInput = {
      evaluation: { ...baseEvaluation, evaluationId: 'e4', proposalId: 'p4', status: 'OUTCOME_INDETERMINATE', achievementRatio: null },
      proposal: { ...baseProposal, proposalId: 'p4' },
    };

    const summaries = aggregateFeedbackCohorts([
      pairAchieved1,
      pairAchieved2,
      pairNotAchieved,
      pairIndeterminate,
    ]);

    expect(summaries.length).toBe(1);
    const summary = summaries[0];
    expect(summary.totalEvaluations).toBe(4);
    expect(summary.achievedCount).toBe(2);
    expect(summary.notAchievedCount).toBe(1);
    expect(summary.indeterminateCount).toBe(1);
    expect(summary.evaluatedCount).toBe(3); // 2 + 1 = 3 (INDETERMINATE excluido del denominador)
    expect(summary.empiricalSuccessRate).toBe(Number((2 / 3).toFixed(6))); // ~0.666667
    expect(summary.averageAchievementRatio).toBe(Number(((1.0 + 1.2 + 0.4) / 3).toFixed(6))); // ~0.866667
    expect(summary.isSufficientSample).toBe(true);
  });

  test('R12: Cohorte sin evaluaciones válidas (solo INDETERMINATE) -> empiricalSuccessRate = null', () => {
    const pairIndeterminate: PairedEvaluationInput = {
      evaluation: { ...baseEvaluation, evaluationId: 'e1', proposalId: 'p1', status: 'OUTCOME_INDETERMINATE', achievementRatio: null },
      proposal: { ...baseProposal, proposalId: 'p1' },
    };

    const summaries = aggregateFeedbackCohorts([pairIndeterminate]);

    expect(summaries.length).toBe(1);
    const summary = summaries[0];
    expect(summary.totalEvaluations).toBe(1);
    expect(summary.achievedCount).toBe(0);
    expect(summary.notAchievedCount).toBe(0);
    expect(summary.indeterminateCount).toBe(1);
    expect(summary.evaluatedCount).toBe(0);
    expect(summary.empiricalSuccessRate).toBeNull(); // Evita falso 0%
    expect(summary.isSufficientSample).toBe(false);
  });

  test('R13: Determinismo estricto de resultados agregados', () => {
    const pairs: PairedEvaluationInput[] = [
      { evaluation: baseEvaluation, proposal: baseProposal },
    ];

    const fixedTime = '2026-09-24T12:00:00.000Z';
    const sum1 = aggregateFeedbackCohorts(pairs, fixedTime);
    const sum2 = aggregateFeedbackCohorts(pairs, fixedTime);

    expect(sum1).toEqual(sum2);
  });

  test('R14: Paridad estricta de planId (evaluation.planId === proposal.planId)', () => {
    const mismatchPlanProposal: RepairProposalRecord = {
      ...baseProposal,
      planId: 'plan-uuid-999-mismatch',
    };

    expect(() => {
      projectOutcomeEvaluationToFact(baseEvaluation, mismatchPlanProposal);
    }).toThrow('PLAN_ID_PARITY_MISMATCH');
  });

  test('R15: Ausencia de lenguaje causal en descripciones generadas', () => {
    const fact = projectOutcomeEvaluationToFact(baseEvaluation, baseProposal);

    expect(fact.description).not.toContain('caused');
    expect(fact.description).not.toContain('por culpa de');
    expect(fact.description).not.toContain('fricción operacional');
    expect(fact.description).toContain('[DERIVED_OUTCOME_EVALUATION]');
  });

  test('R16: Memoria volátil de sesión (Buffer no persistente)', () => {
    const memoryBuffer = new GovernedFeedbackMemoryBuffer();
    expect(memoryBuffer.getPairs().length).toBe(0);

    memoryBuffer.pushPair({ evaluation: baseEvaluation, proposal: baseProposal });
    expect(memoryBuffer.getPairs().length).toBe(1);

    const report = memoryBuffer.getReport('2026-09-24T12:00:00.000Z');
    expect(report.totalEvaluationsProcessed).toBe(1);
    expect(report.distinctCohortsCount).toBe(1);

    memoryBuffer.clear();
    expect(memoryBuffer.getPairs().length).toBe(0);
    expect(memoryBuffer.getReport().totalEvaluationsProcessed).toBe(0);
  });

  test('R17: Principio de no-autorización (requiresHumanReview === true y semántica consultiva)', () => {
    const summaries = aggregateFeedbackCohorts([
      { evaluation: baseEvaluation, proposal: baseProposal },
    ]);

    expect(summaries[0].requiresHumanReview).toBe(true);
    expect(summaries[0].timezone).toBe('America/Bogota');
    expect(summaries[0].evaluatorVersion).toBe('v1.0');
  });
});
