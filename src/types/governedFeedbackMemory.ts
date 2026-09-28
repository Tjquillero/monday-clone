/**
 * Mantenix - Hito 7.9 Governed Feedback Memory & Derived Telemetry Bridge v1.0
 * Contratos de Tipos e Interfaz Canónica de Memoria de Feedback Gobernada
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 migraciones SQL, 0 tablas nuevas, 0 RPCs de escritura.
 * - H6.2 -> H7.8 READ ONLY: Capas previas intactas y consumidas como autoridad soberana.
 * - Categoría A: Read-Only, puro en memoria, determinista y de naturaleza consultiva.
 * - Memoria Volátil de Sesión: H7.9 Memory != Persistent Historical Database.
 * - Proveniencia Explícita: Distinción formal entre telemetría primaria y hecho derivado de evaluación.
 * - Join Contractual H7.8 + H7.5: Paridad estricta de proposalId y planId sin inferencias.
 * - Transparencia de Indeterminación: OUTCOME_INDETERMINATE nunca entra al denominador de éxito.
 * - No-Autorización: El feedback informa contexto, NUNCA autoriza acciones ni modifica PolicyEngine.
 */

import { OutcomeEvaluationRecord, OutcomeEvaluationStatus } from './agentOutcomeEvaluation';
import { RepairProposalRecord, RepairActionType } from './repairProposal';
import { MetricDirection } from './recoveryValidation';
import { ObservabilityFactRecord } from './observabilityRuntime';

/**
 * Par de Evaluación Gobernada: Join formal tipado entre H7.8 y H7.5
 */
export interface PairedEvaluationInput {
  evaluation: OutcomeEvaluationRecord;
  proposal: RepairProposalRecord;
}

/**
 * Identidad Cuádruple de Cohorte de Feedback
 */
export interface FeedbackCohortIdentity {
  actionType: RepairActionType;
  targetEntityId: string;
  targetMetric: string;
  metricDirection: MetricDirection;
}

/**
 * Resumen Agregado de Cohorte de Feedback en Memoria (Output H7.9)
 */
export interface GovernedFeedbackCohortSummary {
  cohortKey: string; // cohort__{actionType}__{targetEntityId}__{targetMetric}__{metricDirection}
  actionType: RepairActionType;
  targetEntityId: string;
  targetMetric: string;
  metricDirection: MetricDirection;
  totalEvaluations: number;
  achievedCount: number;
  notAchievedCount: number;
  indeterminateCount: number;
  evaluatedCount: number; // achievedCount + notAchievedCount (denominador de tasa de éxito)
  empiricalSuccessRate: number | null; // null si evaluatedCount === 0; achievedCount / evaluatedCount
  averageAchievementRatio: number | null; // promedio de achievementRatio numéricos válidos en la cohorte
  isSufficientSample: boolean; // true si evaluatedCount > 0
  evaluatedAt: string; // UTC ISO 8601
  timezone: 'America/Bogota';
  evaluatorVersion: 'v1.0';
  /**
   * Principio de No-Autorización:
   * El feedback summary es estrictamente consultivo y NUNCA constituye autorización de acción.
   * Cualquier formulación o ejecución de intervención informada por este resumen
   * requiere revisión y firma humana previa.
   */
  requiresHumanReview: true;
}

/**
 * Reporte Consolidado de Múltiples Cohortes de Feedback en Memoria
 */
export interface GovernedFeedbackMemoryReport {
  reportId: string;
  totalEvaluationsProcessed: number;
  distinctCohortsCount: number;
  cohortSummaries: GovernedFeedbackCohortSummary[];
  derivedFacts: ObservabilityFactRecord[];
  evaluatedAt: string; // UTC ISO 8601
  timezone: 'America/Bogota';
  evaluatorVersion: 'v1.0';
  requiresHumanReview: true;
}
