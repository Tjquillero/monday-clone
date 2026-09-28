/**
 * Mantenix - Hito 7.10 Governed Feedback Contextualization & Decision Dossier Engine v1.0
 * Contratos de Tipos e Interfaz Canónica del Expediente de Contexto de Decisión
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 migraciones SQL, 0 tablas nuevas, 0 RPCs de escritura.
 * - H6.2 -> H7.9 READ ONLY: Capas previas intactas y consumidas como autoridad soberana.
 * - Categoría A: Read-Only, 100% puro en memoria, determinista y consultivo.
 * - Taxonomía Descriptiva Cuádruple: NO_HISTORICAL_DATA | ONLY_INDETERMINATE_EVIDENCE | HISTORICAL_EVALUATIONS_AVAILABLE | INDETERMINATE_INPUT.
 * - Cero Valores Mágicos: Ausencia de expectedOutcome/métricas -> null, jamás ceros de utilería.
 * - Determinismo Absoluto de evaluatedAt: Procedente de cohortSummary.evaluatedAt o null (0 llamadas a new Date()).
 * - No-Autorización: authorizationStatement = 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION' obligatorio.
 */

import { RepairProposalRecord, RepairActionType } from './repairProposal';
import { MetricDirection } from './recoveryValidation';
import { GovernedFeedbackCohortSummary } from './governedFeedbackMemory';

/**
 * Estado Epistemológico del Feedback Histórico Contextualizado (H7.10)
 */
export type HistoricalFeedbackStatus =
  | 'NO_HISTORICAL_DATA'              // Cohorte válida pero sin antecedentes en memoria (evaluatedCount === 0 && indeterminateCount === 0)
  | 'ONLY_INDETERMINATE_EVIDENCE'    // Cohorte con antecedentes exclusivamente indeterminados (evaluatedCount === 0 && indeterminateCount > 0)
  | 'HISTORICAL_EVALUATIONS_AVAILABLE' // Cohorte con evaluaciones válidas (evaluatedCount > 0)
  | 'INDETERMINATE_INPUT';           // Propuesta inválida/incompleta, incoherencias de cohorte o duplicidad de CohortKey en el input

/**
 * Trazabilidad de Procedencia de Contexto Autorizada
 */
export interface ContextProvenanceTrail {
  proposalId: string;
  planId: string;
  cohortKey: string;
}

/**
 * Expediente de Contexto de Decisión Gobernada (Output H7.10)
 */
export interface DecisionContextDossier {
  proposalId: string;
  planId: string;
  actionType: RepairActionType | null;
  targetEntityId: string | null;
  targetMetric: string | null;
  metricDirection: MetricDirection | null;
  projectedDelta: number | null; // null si expectedOutcome no existe; nunca 0 de utilería

  cohortKey: string;
  historicalFeedbackStatus: HistoricalFeedbackStatus;

  totalEvaluations: number;
  evaluatedCount: number;
  achievedCount: number;
  notAchievedCount: number;
  indeterminateCount: number;

  empiricalSuccessRate: number | null;
  averageAchievementRatio: number | null;

  contextProvenance: ContextProvenanceTrail;

  evaluatedAt: string | null; // Procedente estrictamente de cohortSummary.evaluatedAt o null
  timezone: 'America/Bogota';
  evaluatorVersion: 'v1.0';

  /**
   * Principio de No-Autorización:
   * El dossier es estrictamente consultivo y NUNCA constituye autorización de acción ni modifica el PolicyEngine.
   */
  requiresHumanReview: true;
  authorizationStatement: 'CONSULTIVE_CONTEXT_ONLY_NO_AUTHORIZATION';
}
