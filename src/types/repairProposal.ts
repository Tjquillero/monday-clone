/**
 * Mantenix - Hito 7.5 Governed Repair & Action Proposal Engine v1.0
 * Contrato de Tipos e Interfaz Canonical de Propuesta Declarativa de Reparación
 *
 * Principios Invariantes:
 * - 0 mutaciones BD, 0 DDL, 0 SQL migrations, 0 RPCs de escritura, 0 ejecución autónoma en producción.
 * - Proponer != Ejecutar: H7.5 construye artefactos declarativos tipados, jamás muta producción ni ejecuta GatewayRPC.
 * - Fingerprint Canónico SHA-256 determinista sobre campos estables (excluyendo marcas de tiempo).
 * - Target Declarativo: 'SandboxEngine' (para pruebas aisladas H7.1B) o 'HumanReviewNotice' (para revisiones consultivas).
 */

import { ActionPlanRecord, RecommendationCategory } from './actionPlanning';
import { ObservabilityFactRecord } from './observabilityRuntime';

/**
 * Tipo de Acción de Reparación/Intervención Declarativa en H7.5
 */
export type RepairActionType =
  | 'PROPOSE_CREW_REASSIGNMENT'         // Propuesta de reasignación para CrewAssignmentService
  | 'PROPOSE_SCHEDULE_OVERRIDE'         // Propuesta de reprogramación con OCC para MaintenanceScheduleService
  | 'PROPOSE_RESOURCE_REBALANCE'        // Propuesta de rebalanceo para ResourceConsumptionControlService
  | 'PROPOSE_CONTRACT_TARGET_REVIEW'    // Expediente de revisión contractual POA
  | 'PROPOSE_FIELD_INSPECTION_TICKET'   // Ticket de inspección física en sitio
  | 'PROPOSE_SUPERVISOR_ALERT';         // Notificación estructurada a supervisión

/**
 * Mapeo canónico entre categoría H7.4 y tipo de propuesta H7.5
 */
export const CATEGORY_TO_ACTION_TYPE_MAP: Record<RecommendationCategory, RepairActionType> = {
  REALLOCATE_CREW: 'PROPOSE_CREW_REASSIGNMENT',
  ADJUST_MAINTENANCE_SCHEDULE: 'PROPOSE_SCHEDULE_OVERRIDE',
  REBALANCE_RESOURCES: 'PROPOSE_RESOURCE_REBALANCE',
  REVIEW_CONTRACTUAL_TARGET: 'PROPOSE_CONTRACT_TARGET_REVIEW',
  FLAG_FOR_FIELD_INSPECTION: 'PROPOSE_FIELD_INSPECTION_TICKET',
  NOTIFY_SUPERVISOR: 'PROPOSE_SUPERVISOR_ALERT',
};

/**
 * Estado Epistemológico de la Evaluación de Reparación (H7.5)
 */
export type RepairEvaluationStatus =
  | 'PROPOSAL_GENERATED' // Se generó una propuesta declarativa válida
  | 'NO_REPAIR_FEASIBLE' // El plan no tiene status RECOMMENDED (INDETERMINATE, NO_ACTION_REQUIRED, RISK_EXCEEDED)
  | 'INDETERMINATE';     // Faltan datos o cuantificación requerida en el plan para armar el payload

/**
 * Destino Declarativo de Evaluación (H7.5)
 * GatewayRPC queda strictly excluded en H7.5 (reservado para fases posteriores de autonomía).
 */
export type RepairEvaluationTarget = 'SandboxEngine' | 'HumanReviewNotice';

/**
 * Mapeo de Destino Declarativo según el tipo de acción
 */
export const ACTION_TYPE_TO_TARGET_MAP: Record<RepairActionType, RepairEvaluationTarget> = {
  PROPOSE_CREW_REASSIGNMENT: 'SandboxEngine',
  PROPOSE_SCHEDULE_OVERRIDE: 'SandboxEngine',
  PROPOSE_RESOURCE_REBALANCE: 'SandboxEngine',
  PROPOSE_FIELD_INSPECTION_TICKET: 'HumanReviewNotice',
  PROPOSE_SUPERVISOR_ALERT: 'HumanReviewNotice',
  PROPOSE_CONTRACT_TARGET_REVIEW: 'HumanReviewNotice',
};

/**
 * Registro de Propuesta de Reparación Gobernada (Output Consolidado H7.5)
 */
export interface RepairProposalRecord {
  proposalId: string;
  planId: string;
  diagnosticId: string;
  anomalyId: string;
  actionType: RepairActionType | null;
  targetEntityId: string | null;
  payload: Record<string, unknown> | null; // Especificación pura de parámetros de propuesta
  expectedOutcome: {
    targetMetric: string;
    projectedDelta: number; // Procedente directamente del ExpectedImpact de H7.4 (R17)
    metricDirection: 'INCREASE' | 'DECREASE'; // Dirección cualitativa explícita (0 heurísticas de adivinanza de cadenas)
  } | null;
  status: RepairEvaluationStatus;
  evaluationTarget: RepairEvaluationTarget | null;
  proposalFingerprintHash?: string; // SHA-256 determinista del manifiesto declarativo
  evaluatedAt: string; // UTC ISO 8601
  timezone: 'America/Bogota'; // Contexto civil/operativo invariable
  proposalVersion: 'v1.0';
  requiresHumanReview: true; // Invariablemente true
}

/**
 * Input para el Motor de Reparación H7.5
 */
export interface RepairProposalInput {
  actionPlan: ActionPlanRecord;
  facts?: ObservabilityFactRecord[];
}
