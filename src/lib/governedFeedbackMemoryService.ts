/**
 * Mantenix - Hito 7.9 Governed Feedback Memory & Derived Telemetry Bridge v1.0
 * Servicio Determinista de Memoria de Feedback Gobernada y Proyección de Telemetría Derivada
 *
 * Principios Invariantes:
 * - 0 mutaciones en base de datos PostgreSQL / Supabase, 0 DDL, 0 RPCs de escritura.
 * - H6.2 -> H7.8 READ ONLY: Consumo soberano sin reabrir hitos congelados.
 * - Categoría A: Read-Only, 100% en memoria, determinista y consultivo.
 * - Memoria Volátil de Sesión: H7.9 Memory != Persistent Database.
 * - Paridad Estricta de Join: evaluation.proposalId === proposal.proposalId && evaluation.planId === proposal.planId.
 * - Proveniencia Explícita: factType: 'DERIVED_OUTCOME_EVALUATION_FACT', attributes.isDerivedFact: true.
 * - Cero Inferencia Causal: Terminología descriptiva de no-logro empírico sin afirmar causalidad mecanicista.
 * - No-Autorización: El feedback informa contexto, NUNCA autoriza acciones ni modifica PolicyEngine.
 */

import { OutcomeEvaluationRecord } from '../types/agentOutcomeEvaluation';
import { RepairProposalRecord, RepairActionType } from '../types/repairProposal';
import { MetricDirection } from '../types/recoveryValidation';
import { ObservabilityFactRecord } from '../types/observabilityRuntime';
import {
  PairedEvaluationInput,
  FeedbackCohortIdentity,
  GovernedFeedbackCohortSummary,
  GovernedFeedbackMemoryReport,
} from '../types/governedFeedbackMemory';

/**
 * 1. Proyecta determinísticamente una evaluación H7.8 y su propuesta H7.5
 * a un ObservabilityFactRecord derivado de H7.1.
 */
export function projectOutcomeEvaluationToFact(
  evaluation: OutcomeEvaluationRecord,
  proposal: RepairProposalRecord
): ObservabilityFactRecord {
  // Validación de paridad de join fail-closed
  if (evaluation.proposalId !== proposal.proposalId) {
    throw new Error(
      `CONTRACT_JOIN_MISMATCH: evaluation.proposalId ('${evaluation.proposalId}') does not match proposal.proposalId ('${proposal.proposalId}')`
    );
  }

  if (evaluation.planId !== proposal.planId) {
    throw new Error(
      `PLAN_ID_PARITY_MISMATCH: evaluation.planId ('${evaluation.planId}') does not match proposal.planId ('${proposal.planId}')`
    );
  }

  const actionType = proposal.actionType ?? 'UNKNOWN_ACTION';
  const targetEntityId = proposal.targetEntityId ?? 'UNKNOWN_ENTITY';
  const factId = `derived-fact-${evaluation.evaluationId}`;
  const correlationId = evaluation.planId; // Sourced directly from authoritative field

  const attributes: Record<string, number | string | boolean | null> = {
    isDerivedFact: true,
    provenance: 'H7.8_OUTCOME_EVALUATION',
    evaluationId: evaluation.evaluationId,
    applicationId: evaluation.applicationId,
    applicationMutationId: evaluation.applicationMutationId,
    proposalId: evaluation.proposalId,
    planId: evaluation.planId,
    actionType: String(actionType),
    targetEntityId: String(targetEntityId),
    targetMetric: evaluation.targetMetric,
    metricDirection: evaluation.metricDirection,
    baselineValue: evaluation.baselineValue,
    projectedValue: evaluation.projectedValue,
    projectedDelta: evaluation.projectedDelta,
    observedValue: evaluation.observedValue,
    observedDelta: evaluation.observedDelta,
    achievementRatio: evaluation.achievementRatio,
    evaluationStatus: evaluation.status,
    requiresHumanReview: true,
  };

  return {
    factId,
    correlationId,
    factType: 'DERIVED_OUTCOME_EVALUATION_FACT',
    description: `[DERIVED_OUTCOME_EVALUATION] ${actionType} on ${targetEntityId}: ${evaluation.targetMetric} -> ${evaluation.status} (ratio: ${evaluation.achievementRatio ?? 'N/A'})`,
    observedAt: evaluation.evaluatedAt,
    sourceComponent: 'GovernedFeedbackMemoryService_v1.0',
    rawEnvelopeId: evaluation.evaluationId,
    attributes,
  };
}

/**
 * 2. Genera una clave de cohorte canónica cuádruple determinista
 */
export function generateCohortKey(identity: FeedbackCohortIdentity): string {
  return `cohort__${identity.actionType}__${identity.targetEntityId}__${identity.targetMetric}__${identity.metricDirection}`;
}

/**
 * 3. Agrega determinísticamente una cohorte de pares de evaluación en memoria
 */
export function aggregateFeedbackCohorts(
  pairedEvaluations: PairedEvaluationInput[],
  evaluatedAtIso?: string
): GovernedFeedbackCohortSummary[] {
  const evaluatedAt = evaluatedAtIso || new Date().toISOString();

  if (!pairedEvaluations || pairedEvaluations.length === 0) {
    return [];
  }

  // Agrupamiento por clave cuádruple
  const cohortGroups = new Map<string, {
    identity: FeedbackCohortIdentity;
    evaluations: OutcomeEvaluationRecord[];
  }>();

  for (const pair of pairedEvaluations) {
    const { evaluation, proposal } = pair;

    // Validación de join
    if (evaluation.proposalId !== proposal.proposalId) {
      throw new Error(
        `CONTRACT_JOIN_MISMATCH: evaluation.proposalId ('${evaluation.proposalId}') does not match proposal.proposalId ('${proposal.proposalId}')`
      );
    }
    if (evaluation.planId !== proposal.planId) {
      throw new Error(
        `PLAN_ID_PARITY_MISMATCH: evaluation.planId ('${evaluation.planId}') does not match proposal.planId ('${proposal.planId}')`
      );
    }

    const identity: FeedbackCohortIdentity = {
      actionType: (proposal.actionType as RepairActionType) || ('UNKNOWN_ACTION' as RepairActionType),
      targetEntityId: proposal.targetEntityId || 'UNKNOWN_ENTITY',
      targetMetric: evaluation.targetMetric,
      metricDirection: evaluation.metricDirection,
    };

    const cohortKey = generateCohortKey(identity);

    if (!cohortGroups.has(cohortKey)) {
      cohortGroups.set(cohortKey, { identity, evaluations: [] });
    }

    cohortGroups.get(cohortKey)!.evaluations.push(evaluation);
  }

  const summaries: GovernedFeedbackCohortSummary[] = [];

  for (const [cohortKey, group] of cohortGroups.entries()) {
    const { identity, evaluations } = group;
    const totalEvaluations = evaluations.length;

    let achievedCount = 0;
    let notAchievedCount = 0;
    let indeterminateCount = 0;
    const validRatios: number[] = [];

    for (const ev of evaluations) {
      if (ev.status === 'OUTCOME_ACHIEVED') {
        achievedCount++;
      } else if (ev.status === 'OUTCOME_NOT_ACHIEVED') {
        notAchievedCount++;
      } else {
        indeterminateCount++;
      }

      if (ev.achievementRatio !== null && Number.isFinite(ev.achievementRatio)) {
        validRatios.push(ev.achievementRatio);
      }
    }

    const evaluatedCount = achievedCount + notAchievedCount;

    // empiricalSuccessRate: null si evaluatedCount === 0 (evita falso 0%)
    const empiricalSuccessRate =
      evaluatedCount > 0
        ? Number((achievedCount / evaluatedCount).toFixed(6))
        : null;

    const averageAchievementRatio =
      validRatios.length > 0
        ? Number((validRatios.reduce((acc, r) => acc + r, 0) / validRatios.length).toFixed(6))
        : null;

    summaries.push({
      cohortKey,
      actionType: identity.actionType,
      targetEntityId: identity.targetEntityId,
      targetMetric: identity.targetMetric,
      metricDirection: identity.metricDirection,
      totalEvaluations,
      achievedCount,
      notAchievedCount,
      indeterminateCount,
      evaluatedCount,
      empiricalSuccessRate,
      averageAchievementRatio,
      isSufficientSample: evaluatedCount > 0,
      evaluatedAt,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    });
  }

  // Ordenamiento lexicográfico determinista por cohortKey ASC
  return summaries.sort((a, b) => a.cohortKey.localeCompare(b.cohortKey));
}

/**
 * 4. Genera un reporte consolidado de memoria de feedback en sesión activa
 */
export function evaluateHistoricalFeedbackReport(
  pairedEvaluations: PairedEvaluationInput[],
  evaluatedAtIso?: string
): GovernedFeedbackMemoryReport {
  const evaluatedAt = evaluatedAtIso || new Date().toISOString();
  const reportId = `feedback-report-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  const derivedFacts: ObservabilityFactRecord[] = (pairedEvaluations || []).map((pair) =>
    projectOutcomeEvaluationToFact(pair.evaluation, pair.proposal)
  );

  const cohortSummaries = aggregateFeedbackCohorts(pairedEvaluations, evaluatedAt);

  return {
    reportId,
    totalEvaluationsProcessed: pairedEvaluations ? pairedEvaluations.length : 0,
    distinctCohortsCount: cohortSummaries.length,
    cohortSummaries,
    derivedFacts,
    evaluatedAt,
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };
}

/**
 * 5. Buffer de Sesión Volátil en Memoria para Feedback Gobernado
 * (Declara formalmente que NO persiste a base de datos)
 */
export class GovernedFeedbackMemoryBuffer {
  private buffer: PairedEvaluationInput[] = [];

  pushPair(pair: PairedEvaluationInput): void {
    // Valida paridad antes de insertar en buffer
    if (pair.evaluation.proposalId !== pair.proposal.proposalId) {
      throw new Error(
        `CONTRACT_JOIN_MISMATCH: evaluation.proposalId ('${pair.evaluation.proposalId}') does not match proposal.proposalId ('${pair.proposal.proposalId}')`
      );
    }
    if (pair.evaluation.planId !== pair.proposal.planId) {
      throw new Error(
        `PLAN_ID_PARITY_MISMATCH: evaluation.planId ('${pair.evaluation.planId}') does not match proposal.planId ('${pair.proposal.planId}')`
      );
    }
    this.buffer.push(pair);
  }

  getPairs(): readonly PairedEvaluationInput[] {
    return [...this.buffer];
  }

  getReport(evaluatedAtIso?: string): GovernedFeedbackMemoryReport {
    return evaluateHistoricalFeedbackReport(this.buffer, evaluatedAtIso);
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
