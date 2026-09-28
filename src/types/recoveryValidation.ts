/**
 * Mantenix - Hito 7.6 Governed Recovery & Validation Engine v1.0
 * Contrato de Tipos e Interfaz Canonical de Orquestación, Recuperación y Validación en Sandbox
 *
 * Principios Invariantes:
 * - 0 mutaciones BD producción, 0 DDL, 0 SQL migrations, 0 RPCs de escritura.
 * - H7.6 NO autoriza: consume ActionPolicyDecision previa de H7.1A (si !== 'ALLOW_SANDBOX' -> POLICY_DENIED).
 * - PASS Técnico != Éxito de Negocio: la validación evalúa objetivamente la métrica (MetricDirection).
 * - Rollback con Verificación SHA-256: comparación explícita preExecutionSnapshotHash vs postRollbackSnapshotHash.
 * - Mapeo de Status Limpio: 'HUMAN_REVIEW_REQUIRED' para propuestas consultivas (0 falso 'RECOVERY_SUCCESS').
 */

import { ActionPolicyDecision } from './agentRuntime';
import { RepairProposalRecord } from './repairProposal';

/**
 * Dirección Semántica de la Métrica para Validación Objetiva
 */
export type MetricDirection = 'INCREASE' | 'DECREASE';

/**
 * Estado Epistemológico de la Orquestación y Validación (H7.6)
 */
export type RecoveryExecutionStatus =
  | 'RECOVERY_SUCCESS'            // Ejecución en Sandbox PASS y validación objetiva de métrica PASS
  | 'RECOVERY_FAILED_ROLLED_BACK' // Fallo de ejecución o validación; reversión verificada con hash SHA-256 coincidente
  | 'ROLLBACK_FAILED_HARD_STOP'   // Fallo de reversión; desacuerdo en hashes SHA-256 pre vs post-rollback (Alerta Crítica)
  | 'POLICY_DENIED'               // Denegado por el PolicyEngine de H7.1A (policyDecision !== 'ALLOW_SANDBOX')
  | 'HUMAN_REVIEW_REQUIRED'       // Propuesta consultiva dirigida a 'HumanReviewNotice' (delegación a revisión humana)
  | 'INDETERMINATE';              // Propuesta inválida, nula o datos cuantitativos insuficientes

/**
 * Resultado de Validación Objetiva Post-Ejecución
 */
export interface ObjectiveValidationResult {
  passed: boolean;
  metricName: string;
  expectedDelta: number;
  observedDelta: number;
  metricDirection: MetricDirection;
  validationScore: number; // 0.0 a 1.0
  reasoning: string;
}

/**
 * Registro de Recuperación y Validación Gobernada (Output H7.6)
 */
export interface RecoveryValidationRecord {
  recoveryId: string;
  proposalId: string;
  planId: string;
  diagnosticId: string;
  anomalyId: string;
  status: RecoveryExecutionStatus;
  policyDecisionUsed: ActionPolicyDecision;
  preExecutionSnapshotHash: string | null;
  postExecutionSnapshotHash: string | null;
  postRollbackSnapshotHash: string | null;
  validationResult: ObjectiveValidationResult | null;
  rollbackExecuted: boolean;
  rollbackVerified: boolean;
  evaluatedAt: string; // UTC ISO 8601
  timezone: 'America/Bogota'; // Contexto civil/operativo invariable
  evaluatorVersion: 'v1.0';
  requiresHumanReview: true; // Invariablemente true
}

/**
 * Input para el Motor de Recuperación H7.6
 * Nota: Flags de fault injection son exclusivamente para pruebas unitarias deterministas.
 */
export interface RecoveryValidationInput {
  proposal: RepairProposalRecord;
  policyDecision: ActionPolicyDecision;

  // Control determinista para inyección de fallas en pruebas unitarias (Test-Only)
  simulatedExecutionFail?: boolean;
  simulatedValidationFail?: boolean;
  simulatedRollbackCorrupt?: boolean;
}
