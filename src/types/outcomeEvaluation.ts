/**
 * Types & Domain Contracts for Outcome Evaluation v1
 *
 * Axioma Rector:
 * RECOMENDACIÓN != DECISIÓN != ACCIÓN != RESULTADO != EVALUACIÓN
 *
 * Naturaleza:
 * Read Model / Evaluador Determinista Puro basado en hechos físicos verificados.
 * Desacoplado explícitamente de afirmaciones causales mecanicistas inductivas.
 */

import { OperationalMetricKey } from './operationalMemory';
import { RecommendationKey, TargetEntityReference } from './operationalAdvisory';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Estados de Evaluación y Razones de Indeterminación
// ─────────────────────────────────────────────────────────────────────────────

export type EvaluationStatus =
  | 'EFFECTIVE'
  | 'INEFFECTIVE'
  | 'INCONCLUSIVE'
  | 'NOT_APPLICABLE';

export type EvaluationNonApplicableReason =
  | 'DECISION_REJECTED'
  | 'DECISION_POSTPONED'
  | 'ACTION_NOT_APPLICABLE'
  | 'ACTION_EXECUTION_FAILED'
  | 'ACTION_PENDING';

export type EvaluationInconclusiveReason =
  | 'INSUFFICIENT_POST_SAMPLE_SIZE'
  | 'INSUFFICIENT_CREW_COUNT'
  | 'INSUFFICIENT_EXECUTIONS_PER_CREW'
  | 'EVALUATION_WINDOW_ACTIVE_INCOMPLETE';

// ─────────────────────────────────────────────────────────────────────────────
// 2. Versionado Canónico de Reglas Matemáticas
// ─────────────────────────────────────────────────────────────────────────────

export type EvaluationRuleVersion =
  | 'R01_IP_TARGET_OR_DELTA@v1.0'
  | 'R02_CREW_CV_REDUCTION_AND_THRESHOLD@v1.0'
  | 'R03_RESOURCE_VARIANCE_CONVERGENCE@v1.0'
  | 'R04_UNPLANNED_OVERRUN_ELIMINATION@v1.0';

// ─────────────────────────────────────────────────────────────────────────────
// 3. Definición Formal de Cohortes de Evaluación
// ─────────────────────────────────────────────────────────────────────────────

export interface EvaluationCohort {
  cohortDefinitionVersion: 'COHORT_V1.0';
  baselineExecutionIds: string[];
  postExecutionIds: string[];
  baselineOccurrencesCount: number;
  postOccurrencesCount: number;
  selectionCriteria: {
    boardId: string;
    targetEntity: TargetEntityReference;
    resourceKey?: string | null;
    baselineWindow: { startIso: string; endIso: string };
    evaluationWindow: { startIso: string; endIso: string };
    verificationFilter: 'VERIFIED_ONLY';
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Registro de Evaluación de Resultados
// ─────────────────────────────────────────────────────────────────────────────

export interface OutcomeEvaluationRecord {
  evaluationId: string; // eval__{decisionId}__{ruleVersion}
  decisionId: string;
  recommendationId: string;
  recommendationKey: RecommendationKey;
  ruleVersion: EvaluationRuleVersion;
  cohort: EvaluationCohort;
  evaluationStatus: EvaluationStatus;
  nonApplicableReason?: EvaluationNonApplicableReason | null;
  inconclusiveReason?: EvaluationInconclusiveReason | null;
  metricComparison: {
    metricKey: OperationalMetricKey;
    preObservedValue: number | null;
    postObservedValue: number | null;
    observedDelta: number | null; // post - pre
    unit: string;
  };
  sampleMetrics: {
    baselineSampleSize: number;
    postSampleSize: number;
    distinctCrewsEvaluatedCount?: number;
  };
  evaluatedAtIso: string;
  causalDisclaimer: string; // "Observed delta reflects empirical difference between cohorts; does not constitute inductive causal proof."
}

export interface OutcomeEvaluationOptions {
  evaluatedAt?: Date | string;
}
