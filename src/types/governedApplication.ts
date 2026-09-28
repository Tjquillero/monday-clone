/**
 * Mantenix - Hito 7.7 Governed Application & Weekly Plan Item Gateway Engine v1.0
 * Contrato de Tipos e Interfaz Canónica de Aplicación Gobernada sobre weekly_plan_items
 *
 * Principios Invariantes:
 * - 0 DDL, 0 migraciones SQL, 0 tablas nuevas, 0 RPCs de escritura nuevas.
 * - H6.2 -> H7.6 READ ONLY: Capas previas intactas y consumidas como autoridad.
 * - WRITE SOLO EN weekly_plan_items: Estricto aislamiento de base de datos viva.
 * - Compuerta Triple Concurrente: Requiere (ALLOW_SANDBOX) AND (RECOVERY_SUCCESS) AND (isHumanAuthorized === true).
 *   La autorización humana es una compuerta adicional de negocio, NUNCA un bypass técnico de la validación objetiva.
 * - Gate de Protección: Ítems completados, en progreso o con ejecuciones son estrictamente inmutables.
 */

import { ActionPolicyDecision } from './agentRuntime';
import { RepairProposalRecord, RepairActionType } from './repairProposal';
import { RecoveryValidationRecord } from './recoveryValidation';
import { WeeklyPlanItem } from './weeklyPlan';

/**
 * Estado Epistemológico de la Aplicación Gobernada (H7.7)
 */
export type GovernedApplicationStatus =
  | 'APPLICATION_SUCCESS'      // Aplicación confirmada exitosamente sobre weekly_plan_items
  | 'APPLICATION_DENIED'       // Denegado por fallas de política, estado de validación técnica o falta de autorización humana
  | 'APPLICATION_ROLLED_BACK'  // Fallo en la mutación de weekly_plan_items, estado restaurado
  | 'IDEMPOTENT_REPLAY'        // Mutación ya procesada previamente con la misma applicationMutationId
  | 'TARGET_PROTECTED'         // El ítem destino está protegido (completado, en progreso o con ejecuciones)
  | 'INDETERMINATE';           // Faltan datos requeridos o payload inválido

/**
 * Diferencial de Auditoría de Campos Modificados
 */
export interface ApplicationAuditDiff {
  fieldName: keyof WeeklyPlanItem | string;
  previousValue: unknown;
  newValue: unknown;
}

/**
 * Estructura de Evidencia de Autorización Humana
 */
export interface HumanAuthorizationEvidence {
  actorUserId: string;
  actorRole: 'supervisor' | 'coordinator' | 'admin';
  authorizedAt: string; // UTC ISO 8601
  authorizationNotes?: string;
}

/**
 * Registro de Auditoría de Aplicación Gobernada (Output H7.7)
 */
export interface GovernedApplicationRecord {
  applicationId: string;
  applicationMutationId: string;
  proposalId: string;
  recoveryId: string;
  planId: string;
  targetItemId: string;
  targetTable: 'weekly_plan_items'; // Invariablemente literal 'weekly_plan_items'
  actionType: RepairActionType;
  status: GovernedApplicationStatus;
  policyDecisionUsed: ActionPolicyDecision;
  isHumanAuthorized: boolean;
  actorUserId: string;
  actorRole: string;
  appliedDiffs: ApplicationAuditDiff[];
  beforeSnapshot: Partial<WeeklyPlanItem> | null;
  afterSnapshot: Partial<WeeklyPlanItem> | null;
  appliedAt: string; // UTC ISO 8601
  timezone: 'America/Bogota'; // Contexto civil/operativo invariable
  evaluatorVersion: 'v1.0';
  requiresHumanReview: true; // Invariablemente true
}

/**
 * Input para el Motor de Aplicación Gobernada H7.7
 */
export interface GovernedApplicationInput {
  applicationMutationId: string;
  proposal: RepairProposalRecord;
  recoveryValidation?: RecoveryValidationRecord | null;
  targetItem: WeeklyPlanItem;
  actorUserId: string;
  actorRole: string;
  isHumanAuthorized: boolean; // Obligatorio: debe ser explícito
  policyDecision?: ActionPolicyDecision;
  authorizationEvidence?: HumanAuthorizationEvidence;

  // Control determinista para inyección de fallas en pruebas unitarias (Test-Only)
  simulatedPersistenceFail?: boolean;
}
