/**
 * Mantenix - Hito 7.10 Governed Feedback Contextualization & Decision Dossier Engine v1.0
 * Suite de Pruebas Unitarias de Contextualización de Feedback para Decisiones Humanas
 *
 * Cobertura de Criterios de Aceptación (R1 a R20):
 * R1: HISTORICAL_EVALUATIONS_AVAILABLE - Cohorte con evaluaciones válidas expone tasas y evaluatedAt
 * R2: ONLY_INDETERMINATE_EVIDENCE - Cohorte con evaluatedCount === 0 e indeterminateCount > 0
 * R3: NO_HISTORICAL_DATA - Cohorte no existente o array vacío
 * R4: INDETERMINATE_INPUT - Falta de expectedOutcome (deltas en null, cero inventados)
 * R5: INDETERMINATE_INPUT - Falta de actionType o targetEntityId
 * R6: INDETERMINATE_INPUT - projectedDelta === 0 o dirección inválida
 * R7: AC-2A: Duplicidad de CohortKey en array -> INDETERMINATE_INPUT (fail-closed)
 * R8: Incoherencia en conteos de resumen de cohorte -> INDETERMINATE_INPUT
 * R9: Trazabilidad contextProvenance = { proposalId, planId, cohortKey }
 * R10: Invariante authorizationStatement = 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION'
 * R11: Invariante requiresHumanReview = true y timezone = 'America/Bogota'
 * R12: Determinismo absoluto de evaluatedAt (procedente de summary o null, 0 new Date())
 * R13: Inmutabilidad estricta de objetos input
 * R14: Determinismo total de salida para inputs idénticos
 */

import { contextualizeProposalWithFeedback } from '../governedFeedbackContextualizerService';
import { RepairProposalRecord } from '../../types/repairProposal';
import { GovernedFeedbackCohortSummary } from '../../types/governedFeedbackMemory';

describe('H7.10 Governed Feedback Contextualizer Service v1.0', () => {
  const baseProposal: RepairProposalRecord = {
    proposalId: 'prop-uuid-501',
    planId: 'plan-uuid-601',
    diagnosticId: 'diag-uuid-701',
    anomalyId: 'anom-uuid-801',
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

  const baseCohortSummary: GovernedFeedbackCohortSummary = {
    cohortKey: 'cohort__PROPOSE_SCHEDULE_OVERRIDE__site-barranquilla-norte__execution_rate__INCREASE',
    actionType: 'PROPOSE_SCHEDULE_OVERRIDE',
    targetEntityId: 'site-barranquilla-norte',
    targetMetric: 'execution_rate',
    metricDirection: 'INCREASE',
    totalEvaluations: 4,
    achievedCount: 3,
    notAchievedCount: 1,
    indeterminateCount: 0,
    evaluatedCount: 4,
    empiricalSuccessRate: 0.75,
    averageAchievementRatio: 1.15,
    isSufficientSample: true,
    evaluatedAt: '2026-09-24T12:00:00.000Z',
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };

  test('R1: HISTORICAL_EVALUATIONS_AVAILABLE - Cohorte con evaluaciones válidas', () => {
    const dossier = contextualizeProposalWithFeedback(baseProposal, [baseCohortSummary]);

    expect(dossier.historicalFeedbackStatus).toBe('HISTORICAL_EVALUATIONS_AVAILABLE');
    expect(dossier.empiricalSuccessRate).toBe(0.75);
    expect(dossier.averageAchievementRatio).toBe(1.15);
    expect(dossier.totalEvaluations).toBe(4);
    expect(dossier.evaluatedCount).toBe(4);
    expect(dossier.achievedCount).toBe(3);
    expect(dossier.notAchievedCount).toBe(1);
    expect(dossier.indeterminateCount).toBe(0);
    expect(dossier.evaluatedAt).toBe('2026-09-24T12:00:00.000Z');
    expect(dossier.contextProvenance).toEqual({
      proposalId: 'prop-uuid-501',
      planId: 'plan-uuid-601',
      cohortKey: 'cohort__PROPOSE_SCHEDULE_OVERRIDE__site-barranquilla-norte__execution_rate__INCREASE',
    });
  });

  test('R2: ONLY_INDETERMINATE_EVIDENCE - Cohorte con evaluatedCount === 0 e indeterminateCount > 0', () => {
    const indeterminateSummary: GovernedFeedbackCohortSummary = {
      ...baseCohortSummary,
      totalEvaluations: 2,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 2,
      evaluatedCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      isSufficientSample: false,
      evaluatedAt: '2026-09-24T12:15:00.000Z',
    };

    const dossier = contextualizeProposalWithFeedback(baseProposal, [indeterminateSummary]);

    expect(dossier.historicalFeedbackStatus).toBe('ONLY_INDETERMINATE_EVIDENCE');
    expect(dossier.empiricalSuccessRate).toBeNull();
    expect(dossier.averageAchievementRatio).toBeNull();
    expect(dossier.indeterminateCount).toBe(2);
    expect(dossier.evaluatedCount).toBe(0);
    expect(dossier.evaluatedAt).toBe('2026-09-24T12:15:00.000Z');
  });

  test('R3: NO_HISTORICAL_DATA - Cohorte no existente en el array', () => {
    const otherSummary: GovernedFeedbackCohortSummary = {
      ...baseCohortSummary,
      cohortKey: 'cohort__PROPOSE_SCHEDULE_OVERRIDE__site-cartagena-sur__execution_rate__INCREASE',
      targetEntityId: 'site-cartagena-sur',
    };

    const dossier = contextualizeProposalWithFeedback(baseProposal, [otherSummary]);

    expect(dossier.historicalFeedbackStatus).toBe('NO_HISTORICAL_DATA');
    expect(dossier.empiricalSuccessRate).toBeNull();
    expect(dossier.averageAchievementRatio).toBeNull();
    expect(dossier.totalEvaluations).toBe(0);
    expect(dossier.evaluatedCount).toBe(0);
    expect(dossier.evaluatedAt).toBeNull();
  });

  test('R3B: NO_HISTORICAL_DATA - Array de resúmenes vacío o nulo', () => {
    const dossierEmpty = contextualizeProposalWithFeedback(baseProposal, []);
    expect(dossierEmpty.historicalFeedbackStatus).toBe('NO_HISTORICAL_DATA');
    expect(dossierEmpty.evaluatedAt).toBeNull();

    const dossierNull = contextualizeProposalWithFeedback(baseProposal, null);
    expect(dossierNull.historicalFeedbackStatus).toBe('NO_HISTORICAL_DATA');
    expect(dossierNull.evaluatedAt).toBeNull();
  });

  test('R4: INDETERMINATE_INPUT - Falta de expectedOutcome (deltas en null, cero inventados)', () => {
    const proposalWithoutOutcome: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: null,
    };

    const dossier = contextualizeProposalWithFeedback(proposalWithoutOutcome, [baseCohortSummary]);

    expect(dossier.historicalFeedbackStatus).toBe('INDETERMINATE_INPUT');
    expect(dossier.targetMetric).toBeNull();
    expect(dossier.metricDirection).toBeNull();
    expect(dossier.projectedDelta).toBeNull(); // Estricto: null, jamás 0
    expect(dossier.cohortKey).toBe('INVALID_COHORT_KEY');
    expect(dossier.evaluatedAt).toBeNull();
  });

  test('R5: INDETERMINATE_INPUT - Falta de actionType o targetEntityId', () => {
    const proposalWithoutAction: RepairProposalRecord = {
      ...baseProposal,
      actionType: null,
    };

    const dossier1 = contextualizeProposalWithFeedback(proposalWithoutAction, [baseCohortSummary]);
    expect(dossier1.historicalFeedbackStatus).toBe('INDETERMINATE_INPUT');

    const proposalWithoutEntity: RepairProposalRecord = {
      ...baseProposal,
      targetEntityId: null,
    };

    const dossier2 = contextualizeProposalWithFeedback(proposalWithoutEntity, [baseCohortSummary]);
    expect(dossier2.historicalFeedbackStatus).toBe('INDETERMINATE_INPUT');
  });

  test('R6: INDETERMINATE_INPUT - projectedDelta === 0 o dirección inválida', () => {
    const proposalZeroDelta: RepairProposalRecord = {
      ...baseProposal,
      expectedOutcome: {
        targetMetric: 'execution_rate',
        projectedDelta: 0,
        metricDirection: 'INCREASE',
      },
    };

    const dossier = contextualizeProposalWithFeedback(proposalZeroDelta, [baseCohortSummary]);
    expect(dossier.historicalFeedbackStatus).toBe('INDETERMINATE_INPUT');
  });

  test('R7: AC-2A: Duplicidad de CohortKey en array -> INDETERMINATE_INPUT (fail-closed)', () => {
    const duplicateSummaries: GovernedFeedbackCohortSummary[] = [
      baseCohortSummary,
      { ...baseCohortSummary, empiricalSuccessRate: 0.50 },
    ];

    const dossier = contextualizeProposalWithFeedback(baseProposal, duplicateSummaries);

    expect(dossier.historicalFeedbackStatus).toBe('INDETERMINATE_INPUT');
    expect(dossier.empiricalSuccessRate).toBeNull();
    expect(dossier.evaluatedAt).toBeNull();
  });

  test('R8: Incoherencia en conteos de resumen de cohorte -> INDETERMINATE_INPUT', () => {
    const corruptSummary: GovernedFeedbackCohortSummary = {
      ...baseCohortSummary,
      totalEvaluations: 10, // Incoherente: 3 + 1 + 0 != 10
      achievedCount: 3,
      notAchievedCount: 1,
      indeterminateCount: 0,
    };

    const dossier = contextualizeProposalWithFeedback(baseProposal, [corruptSummary]);

    expect(dossier.historicalFeedbackStatus).toBe('INDETERMINATE_INPUT');
    expect(dossier.empiricalSuccessRate).toBeNull();
    expect(dossier.evaluatedAt).toBeNull();
  });

  test('R9 & R10 & R11: Invariantes de Gobierno y No-Autorización', () => {
    const dossier = contextualizeProposalWithFeedback(baseProposal, [baseCohortSummary]);

    expect(dossier.requiresHumanReview).toBe(true);
    expect(dossier.authorizationStatement).toBe('CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION');
    expect(dossier.timezone).toBe('America/Bogota');
    expect(dossier.evaluatorVersion).toBe('v1.0');
  });

  test('R12 & R14: Determinismo total de salida y evaluatedAt estricto', () => {
    const dossier1 = contextualizeProposalWithFeedback(baseProposal, [baseCohortSummary]);
    const dossier2 = contextualizeProposalWithFeedback(baseProposal, [baseCohortSummary]);

    expect(dossier1).toEqual(dossier2);
    expect(dossier1.evaluatedAt).toBe(baseCohortSummary.evaluatedAt);
  });

  test('R13: Inmutabilidad estricta de objetos de entrada', () => {
    const proposalCopy = JSON.parse(JSON.stringify(baseProposal));
    const summaryCopy = JSON.parse(JSON.stringify(baseCohortSummary));

    contextualizeProposalWithFeedback(baseProposal, [baseCohortSummary]);

    expect(baseProposal).toEqual(proposalCopy);
    expect(baseCohortSummary).toEqual(summaryCopy);
  });
});
