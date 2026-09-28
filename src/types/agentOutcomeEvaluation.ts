/**
 * Mantenix - Hito 7.8 Agent Outcome Evaluation & Governed Feedback Engine v1.0
 * Contrato de Tipos e Interfaz Canónica de Evaluación de Resultados Post-Aplicación
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 migraciones SQL, 0 tablas nuevas, 0 RPCs nuevas.
 * - H6.2 -> H7.7 READ ONLY: Capas previas intactas y consumidas como autoridad.
 * - Categoría A: Evaluador puro en memoria, determinista y de solo lectura.
 * - Autoridad Semántica de Métrica: metricDirection procede de H7.5 ('INCREASE' | 'DECREASE').
 * - Coherencia Estricta:
 *     INCREASE + projectedDelta <= 0 -> INDETERMINATE
 *     DECREASE + projectedDelta >= 0 -> INDETERMINATE
 *     projectedDelta === 0            -> INDETERMINATE
 * - Fail-Closed: Falta de evidencia observable o status !== 'APPLICATION_SUCCESS' -> OUTCOME_INDETERMINATE.
 * - 0 etiquetas inventadas: No existe PARTIALLY_ACHIEVED. Solo ACHIEVED, NOT_ACHIEVED, INDETERMINATE.
 * - Invarianza de Gobierno: requiresHumanReview = true obligatorio.
 */

import { ActionPlanRecord } from './actionPlanning';
import { RepairProposalRecord } from './repairProposal';
import { RecoveryValidationRecord, MetricDirection } from './recoveryValidation';
import { GovernedApplicationRecord } from './governedApplication';
import { ObservabilityFactRecord } from './observabilityRuntime';

/**
 * Estado Epistemológico del Resultado de la Intervención (H7.8)
 */
export type OutcomeEvaluationStatus =
  | 'OUTCOME_ACHIEVED'      // El resultado observado cumple o supera el delta proyectado en la dirección esperada
  | 'OUTCOME_NOT_ACHIEVED'  // Aplicación exitosa pero el resultado observado no alcanzó la mejora proyectada
  | 'OUTCOME_INDETERMINATE'; // Falta de evidencia observable, aplicación no exitosa o datos incoherentes/insuficientes

/**
 * Registro de Evaluación de Resultados Post-Aplicación (Output H7.8)
 */
export interface OutcomeEvaluationRecord {
  evaluationId: string; // Identidad única de ejecución
  applicationId: string;
  applicationMutationId: string;
  proposalId: string;
  planId: string;
  targetMetric: string;
  metricDirection: MetricDirection;
  baselineValue: number | null;
  projectedValue: number | null;
  projectedDelta: number | null;
  observedValue: number | null;
  observedDelta: number | null;
  achievementRatio: number | null; // observedDelta / projectedDelta (numérico puro, sin etiquetas subjetivas)
  status: OutcomeEvaluationStatus;
  reasoning: string;
  evaluatedAt: string; // UTC ISO 8601
  timezone: 'America/Bogota'; // Contexto civil/operativo invariable
  evaluatorVersion: 'v1.0';
  requiresHumanReview: true; // Invariablemente true
}

/**
 * Input para el Motor de Evaluación de Resultados H7.8
 */
export interface OutcomeEvaluationInput {
  application: GovernedApplicationRecord;
  proposal: RepairProposalRecord;
  actionPlan?: ActionPlanRecord | null;
  recoveryValidation?: RecoveryValidationRecord | null;
  observedValue?: number | null; // Valor observado explícito post-aplicación
  postApplicationFacts?: ObservabilityFactRecord[] | null; // Hechos observables post-aplicación (H7.1)
}
