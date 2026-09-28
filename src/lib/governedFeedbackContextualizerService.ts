/**
 * Mantenix - Hito 7.10 Governed Feedback Contextualization & Decision Dossier Engine v1.0
 * Servicio Determinista de Contextualización de Feedback para la Toma de Decisiones Humanas
 *
 * Principios Invariantes:
 * - 0 mutaciones en base de datos PostgreSQL / Supabase, 0 DDL, 0 RPCs de escritura.
 * - H6.2 -> H7.9 READ ONLY: Consumo soberano sin reabrir hitos congelados.
 * - Categoría A: Read-Only, 100% en memoria, determinista, consultivo y libre de I/O.
 * - Taxonomía Descriptiva Cuádruple: NO_HISTORICAL_DATA | ONLY_INDETERMINATE_EVIDENCE | HISTORICAL_EVALUATIONS_AVAILABLE | INDETERMINATE_INPUT.
 * - Cero Valores Mágicos: Ausencia de expectedOutcome/métricas -> null, jamás ceros de utilería.
 * - Determinismo Estricto de evaluatedAt: Procedente de cohortSummary.evaluatedAt o null (0 llamadas a new Date()).
 * - Protección contra Duplicados (AC-2A): Multiplicidad de CohortKey en entrada resulta en INDETERMINATE_INPUT.
 * - Principio de No-Autorización: authorizationStatement = 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION'.
 */

import { RepairProposalRecord, RepairActionType } from '../types/repairProposal';
import { MetricDirection } from '../types/recoveryValidation';
import { GovernedFeedbackCohortSummary } from '../types/governedFeedbackMemory';
import {
  DecisionContextDossier,
  HistoricalFeedbackStatus,
} from '../types/decisionContextDossier';

/**
 * Contextualiza determinísticamente una propuesta de reparación (H7.5) con la memoria de feedback gobernada (H7.9).
 */
export function contextualizeProposalWithFeedback(
  proposal: RepairProposalRecord,
  cohortSummaries?: GovernedFeedbackCohortSummary[] | null
): DecisionContextDossier {
  const proposalId = proposal?.proposalId || 'UNKNOWN_PROPOSAL';
  const planId = proposal?.planId || 'UNKNOWN_PLAN';
  const actionType = (proposal?.actionType as RepairActionType) || null;
  const targetEntityId = proposal?.targetEntityId || null;

  const targetMetric = proposal?.expectedOutcome?.targetMetric || null;
  const metricDirection = (proposal?.expectedOutcome?.metricDirection as MetricDirection) || null;
  const projectedDelta =
    proposal?.expectedOutcome?.projectedDelta !== undefined &&
    proposal?.expectedOutcome?.projectedDelta !== null &&
    Number.isFinite(proposal.expectedOutcome.projectedDelta)
      ? proposal.expectedOutcome.projectedDelta
      : null;

  // --- 1. COMPUERTA FAIL-CLOSED DE INTEGRIDAD DE ENTRADA DE PROPUESTA (AC-6) ---
  if (
    !proposal ||
    !proposal.expectedOutcome ||
    !actionType ||
    !targetEntityId ||
    !targetMetric ||
    (metricDirection !== 'INCREASE' && metricDirection !== 'DECREASE') ||
    projectedDelta === null ||
    projectedDelta === 0
  ) {
    return {
      proposalId,
      planId,
      actionType,
      targetEntityId,
      targetMetric,
      metricDirection,
      projectedDelta,
      cohortKey: 'INVALID_COHORT_KEY',
      historicalFeedbackStatus: 'INDETERMINATE_INPUT',
      totalEvaluations: 0,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      contextProvenance: {
        proposalId,
        planId,
        cohortKey: 'INVALID_COHORT_KEY',
      },
      evaluatedAt: null,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
      authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
    };
  }

  // --- 2. CONSTRUCCIÓN DETERMINISTA DE CLAVE CUÁDRUPLE DE COHORTE (AC-2) ---
  const cohortKey = `cohort__${actionType}__${targetEntityId}__${targetMetric}__${metricDirection}`;

  const contextProvenance = {
    proposalId,
    planId,
    cohortKey,
  };

  // --- 3. COMPUERTA DE AUSENCIA DE RESÚMENES EN MEMORIA (AC-3) ---
  if (!cohortSummaries || cohortSummaries.length === 0) {
    return {
      proposalId,
      planId,
      actionType,
      targetEntityId,
      targetMetric,
      metricDirection,
      projectedDelta,
      cohortKey,
      historicalFeedbackStatus: 'NO_HISTORICAL_DATA',
      totalEvaluations: 0,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      contextProvenance,
      evaluatedAt: null,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
      authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
    };
  }

  // --- 4. BÚSQUEDA Y PROTECCIÓN CONTRA COHORTES DUPLICADAS (AC-2A) ---
  const matchingSummaries = cohortSummaries.filter((s) => s.cohortKey === cohortKey);

  if (matchingSummaries.length > 1) {
    return {
      proposalId,
      planId,
      actionType,
      targetEntityId,
      targetMetric,
      metricDirection,
      projectedDelta,
      cohortKey,
      historicalFeedbackStatus: 'INDETERMINATE_INPUT',
      totalEvaluations: 0,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      contextProvenance,
      evaluatedAt: null,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
      authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
    };
  }

  if (matchingSummaries.length === 0) {
    return {
      proposalId,
      planId,
      actionType,
      targetEntityId,
      targetMetric,
      metricDirection,
      projectedDelta,
      cohortKey,
      historicalFeedbackStatus: 'NO_HISTORICAL_DATA',
      totalEvaluations: 0,
      evaluatedCount: 0,
      achievedCount: 0,
      notAchievedCount: 0,
      indeterminateCount: 0,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      contextProvenance,
      evaluatedAt: null,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
      authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
    };
  }

  const summary = matchingSummaries[0];

  // --- 5. COMPROBACIÓN DEFENSIVA DE INVARIANTES EN EL RESUMEN RECIBIDO ---
  const expectedTotal = summary.achievedCount + summary.notAchievedCount + summary.indeterminateCount;
  const expectedEvaluated = summary.achievedCount + summary.notAchievedCount;

  if (
    summary.totalEvaluations !== expectedTotal ||
    summary.evaluatedCount !== expectedEvaluated
  ) {
    return {
      proposalId,
      planId,
      actionType,
      targetEntityId,
      targetMetric,
      metricDirection,
      projectedDelta,
      cohortKey,
      historicalFeedbackStatus: 'INDETERMINATE_INPUT',
      totalEvaluations: summary.totalEvaluations,
      evaluatedCount: summary.evaluatedCount,
      achievedCount: summary.achievedCount,
      notAchievedCount: summary.notAchievedCount,
      indeterminateCount: summary.indeterminateCount,
      empiricalSuccessRate: null,
      averageAchievementRatio: null,
      contextProvenance,
      evaluatedAt: null,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
      authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
    };
  }

  // --- 6. DERIVACIÓN DEL ESTADO DE FEEDBACK HISTÓRICO (AC-4 & AC-5) ---
  let historicalFeedbackStatus: HistoricalFeedbackStatus;

  if (summary.evaluatedCount === 0 && summary.indeterminateCount === 0) {
    historicalFeedbackStatus = 'NO_HISTORICAL_DATA';
  } else if (summary.evaluatedCount === 0 && summary.indeterminateCount > 0) {
    historicalFeedbackStatus = 'ONLY_INDETERMINATE_EVIDENCE';
  } else {
    historicalFeedbackStatus = 'HISTORICAL_EVALUATIONS_AVAILABLE';
  }

  return {
    proposalId,
    planId,
    actionType,
    targetEntityId,
    targetMetric,
    metricDirection,
    projectedDelta,
    cohortKey,
    historicalFeedbackStatus,
    totalEvaluations: summary.totalEvaluations,
    evaluatedCount: summary.evaluatedCount,
    achievedCount: summary.achievedCount,
    notAchievedCount: summary.notAchievedCount,
    indeterminateCount: summary.indeterminateCount,
    empiricalSuccessRate: summary.empiricalSuccessRate,
    averageAchievementRatio: summary.averageAchievementRatio,
    contextProvenance,
    evaluatedAt: summary.evaluatedAt || null,
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
    authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION',
  };
}
