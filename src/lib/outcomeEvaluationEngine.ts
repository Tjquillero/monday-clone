/**
 * Mantenix - Hito 7.8 Agent Outcome Evaluation & Governed Feedback Engine v1.0
 * Motor Determinista de Evaluación de Resultados Post-Aplicación
 *
 * Principios Invariantes:
 * - 0 mutaciones en base de datos, 0 DDL, 0 RPCs de escritura.
 * - H6.2 -> H7.7 READ ONLY: Capas previas consumidas como autoridad soberana.
 * - Pureza Matemática: observedDelta = observedValue - baselineValue.
 * - Autoridad Semántica de Métrica: metricDirection de H7.5 ('INCREASE' | 'DECREASE').
 * - Coherencia Estricta:
 *     INCREASE + projectedDelta <= 0 -> INDETERMINATE
 *     DECREASE + projectedDelta >= 0 -> INDETERMINATE
 *     projectedDelta === 0            -> INDETERMINATE
 * - Fail-Closed: Sin inventar valores faltantes (0 adivinanzas).
 * - 0 etiquetas inventadas: No existe PARTIALLY_ACHIEVED.
 * - Invarianza de Gobierno: requiresHumanReview = true obligatorio.
 */

import {
  OutcomeEvaluationInput,
  OutcomeEvaluationRecord,
  OutcomeEvaluationStatus,
} from '../types/agentOutcomeEvaluation';
import { MetricDirection } from '../types/recoveryValidation';

/**
 * Evalúa determinísticamente el resultado de una intervención gobernada post-aplicación (H7.8).
 */
export function evaluateGovernedOutcome(
  input: OutcomeEvaluationInput
): OutcomeEvaluationRecord {
  const evaluatedAt = new Date().toISOString();
  const evaluationId = crypto.randomUUID();

  const {
    application,
    proposal,
    actionPlan,
    observedValue: explicitObservedValue,
    postApplicationFacts,
  } = input;

  const targetMetric =
    proposal.expectedOutcome?.targetMetric ??
    actionPlan?.primaryRecommendation?.expectedImpact?.metric ??
    'UNKNOWN_METRIC';

  const metricDirection =
    (proposal.expectedOutcome?.metricDirection as MetricDirection) ??
    null;

  const projectedDelta =
    proposal.expectedOutcome?.projectedDelta ??
    actionPlan?.primaryRecommendation?.expectedImpact?.estimatedImprovement ??
    null;

  const baselineValue =
    actionPlan?.primaryRecommendation?.expectedImpact?.baselineValue ??
    null;

  const projectedValue =
    actionPlan?.primaryRecommendation?.expectedImpact?.projectedValue ??
    null;

  // Resolución determinista de observedValue sin inventar fuentes
  let observedValue: number | null = null;
  if (explicitObservedValue !== undefined && explicitObservedValue !== null && Number.isFinite(explicitObservedValue)) {
    observedValue = explicitObservedValue;
  } else if (postApplicationFacts && postApplicationFacts.length > 0) {
    for (const fact of postApplicationFacts) {
      const attrVal = fact.attributes?.[targetMetric];
      if (typeof attrVal === 'number' && Number.isFinite(attrVal)) {
        observedValue = attrVal;
        break;
      }
    }
  }

  // --- COMPUERTAS DE EVALUACIÓN DETERMINISTAS (FAIL-CLOSED) ---

  // 1. Verificación de éxito en la aplicación gobernada H7.7
  if (application.status !== 'APPLICATION_SUCCESS') {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection: metricDirection ?? 'INCREASE',
      baselineValue,
      projectedValue,
      projectedDelta,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: `APPLICATION_NOT_SUCCESSFUL: Outcome cannot be evaluated because governed application status is '${application.status}'`,
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 2. Verificación de existencia de expectedOutcome
  if (!proposal.expectedOutcome) {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection: metricDirection ?? 'INCREASE',
      baselineValue,
      projectedValue,
      projectedDelta,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: 'MISSING_EXPECTED_OUTCOME: Proposal lacks explicit expectedOutcome specification',
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 3. Verificación de dirección válida
  if (metricDirection !== 'INCREASE' && metricDirection !== 'DECREASE') {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection: 'INCREASE', // fallback de render
      baselineValue,
      projectedValue,
      projectedDelta,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: `INVALID_METRIC_DIRECTION: Metric direction must be INCREASE or DECREASE, received '${String(metricDirection)}'`,
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 4. Verificación de projectedDelta no nulo y distinto de cero
  if (projectedDelta === null || !Number.isFinite(projectedDelta) || projectedDelta === 0) {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection,
      baselineValue,
      projectedValue,
      projectedDelta: projectedDelta ?? null,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: 'INVALID_PROJECTED_DELTA: Projected delta must be a non-zero finite number',
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 5. Verificación de coherencia entre metricDirection y projectedDelta (C1)
  if (metricDirection === 'INCREASE' && projectedDelta <= 0) {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection,
      baselineValue,
      projectedValue,
      projectedDelta,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: `INCOHERENT_DIRECTION_DELTA: Metric direction is INCREASE but projectedDelta (${projectedDelta}) is <= 0`,
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  if (metricDirection === 'DECREASE' && projectedDelta >= 0) {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection,
      baselineValue,
      projectedValue,
      projectedDelta,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: `INCOHERENT_DIRECTION_DELTA: Metric direction is DECREASE but projectedDelta (${projectedDelta}) is >= 0`,
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 6. Verificación de baselineValue
  if (baselineValue === null || !Number.isFinite(baselineValue)) {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection,
      baselineValue: null,
      projectedValue,
      projectedDelta,
      observedValue,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: 'INVALID_BASELINE_VALUE: Baseline value is missing or not a finite number',
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 7. Verificación de observedValue (C2)
  if (observedValue === null || !Number.isFinite(observedValue)) {
    return {
      evaluationId,
      applicationId: application.applicationId,
      applicationMutationId: application.applicationMutationId,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      targetMetric,
      metricDirection,
      baselineValue,
      projectedValue,
      projectedDelta,
      observedValue: null,
      observedDelta: null,
      achievementRatio: null,
      status: 'OUTCOME_INDETERMINATE',
      reasoning: `INSUFFICIENT_POST_APPLICATION_EVIDENCE: No valid observed value available for target metric '${targetMetric}'`,
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // --- CÁLCULOS DETERMINISTAS Y EVALUACIÓN DE RESULTADO ---
  const observedDelta = Number((observedValue - baselineValue).toFixed(6));
  const achievementRatio = Number((observedDelta / projectedDelta).toFixed(6));

  let status: OutcomeEvaluationStatus;
  let reasoning: string;

  if (metricDirection === 'INCREASE') {
    if (observedDelta >= projectedDelta) {
      status = 'OUTCOME_ACHIEVED';
      reasoning = `OUTCOME_ACHIEVED: Observed delta (${observedDelta}) meets or exceeds projected increase (${projectedDelta})`;
    } else {
      status = 'OUTCOME_NOT_ACHIEVED';
      reasoning = `OUTCOME_NOT_ACHIEVED: Observed delta (${observedDelta}) failed to reach projected increase (${projectedDelta})`;
    }
  } else {
    // metricDirection === 'DECREASE'
    if (observedDelta <= projectedDelta) {
      status = 'OUTCOME_ACHIEVED';
      reasoning = `OUTCOME_ACHIEVED: Observed delta (${observedDelta}) meets or exceeds projected reduction (${projectedDelta})`;
    } else {
      status = 'OUTCOME_NOT_ACHIEVED';
      reasoning = `OUTCOME_NOT_ACHIEVED: Observed delta (${observedDelta}) failed to reach projected reduction (${projectedDelta})`;
    }
  }

  return {
    evaluationId,
    applicationId: application.applicationId,
    applicationMutationId: application.applicationMutationId,
    proposalId: proposal.proposalId,
    planId: proposal.planId,
    targetMetric,
    metricDirection,
    baselineValue,
    projectedValue,
    projectedDelta,
    observedValue,
    observedDelta,
    achievementRatio,
    status,
    reasoning,
    evaluatedAt,
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };
}
