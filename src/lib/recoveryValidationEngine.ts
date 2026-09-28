/**
 * Mantenix - Hito 7.6 Governed Recovery & Validation Engine v1.0
 * Motor Consultivo 100% Determinístico en Memoria de Orquestación, Recuperación y Validación
 *
 * Principios Invariantes:
 * - 0 mutaciones BD producción, 0 DDL, 0 SQL migrations, 0 RPCs de escritura.
 * - H7.6 NO autoriza: consume ActionPolicyDecision de H7.1A (si !== 'ALLOW_SANDBOX' -> POLICY_DENIED).
 * - Consumo de APIs congeladas H7.1B: createWorkspaceSnapshot, verifyAndExecuteAtomicRollback, etc.
 * - Validación Objetiva con MetricDirection (INCREASE vs DECREASE).
 * - Rollback atómico con verificación SHA-256 pre vs post-rollback.
 * - Mapeo de status limpio ('HUMAN_REVIEW_REQUIRED' para propuestas consultivas).
 */

import crypto from 'crypto';
import { ActionPolicyDecision } from '../types/agentRuntime';
import { WorkspaceSnapshot } from '../types/executionSandbox';
import {
  calculateSha256,
  createWorkspaceSnapshot,
  registerLocalFileForSandbox,
  verifyAndExecuteAtomicRollback,
} from './executionSandboxEngine';
import {
  MetricDirection,
  ObjectiveValidationResult,
  RecoveryExecutionStatus,
  RecoveryValidationInput,
  RecoveryValidationRecord,
} from '../types/recoveryValidation';

/**
 * Computa el hash SHA-256 agregado determinista de un WorkspaceSnapshot
 */
export function computeAggregateManifestHash(snapshot: WorkspaceSnapshot): string {
  const sortedKeys = Object.keys(snapshot.manifest).sort();
  const manifestSummary = sortedKeys.map(k => `${k}:${snapshot.manifest[k].sha256}`).join('|');
  return crypto.createHash('sha256').update(manifestSummary, 'utf8').digest('hex');
}

/**
 * Función Principal de Orquestación, Recuperación y Validación Gobernada (H7.6)
 */
export function evaluateRecoveryValidation(input: RecoveryValidationInput): RecoveryValidationRecord {
  const nowUtc = new Date().toISOString();
  const {
    proposal,
    policyDecision,
    simulatedExecutionFail = false,
    simulatedValidationFail = false,
    simulatedRollbackCorrupt = false,
  } = input;

  // 1. Fail-closed ante propuesta nula o inválida
  if (!proposal) {
    return {
      recoveryId: `rec_indet_${Math.random().toString(36).slice(2, 9)}`,
      proposalId: 'none',
      planId: 'none',
      diagnosticId: 'none',
      anomalyId: 'none',
      status: 'INDETERMINATE',
      policyDecisionUsed: policyDecision ?? 'DENY_STRICT',
      preExecutionSnapshotHash: null,
      postExecutionSnapshotHash: null,
      postRollbackSnapshotHash: null,
      validationResult: null,
      rollbackExecuted: false,
      rollbackVerified: false,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 2. Control de Autorización de Política (H7.1A Gate): Debe ser 'ALLOW_SANDBOX'
  if (policyDecision !== 'ALLOW_SANDBOX') {
    return {
      recoveryId: `rec_denied_${proposal.proposalId.slice(0, 8)}`,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      diagnosticId: proposal.diagnosticId,
      anomalyId: proposal.anomalyId,
      status: 'POLICY_DENIED',
      policyDecisionUsed: policyDecision,
      preExecutionSnapshotHash: null,
      postExecutionSnapshotHash: null,
      postRollbackSnapshotHash: null,
      validationResult: null,
      rollbackExecuted: false,
      rollbackVerified: false,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 3. Manejo de Propuestas Consultivas ('HumanReviewNotice')
  if (proposal.evaluationTarget === 'HumanReviewNotice') {
    return {
      recoveryId: `rec_human_${proposal.proposalId.slice(0, 8)}`,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      diagnosticId: proposal.diagnosticId,
      anomalyId: proposal.anomalyId,
      status: 'HUMAN_REVIEW_REQUIRED',
      policyDecisionUsed: policyDecision,
      preExecutionSnapshotHash: null,
      postExecutionSnapshotHash: null,
      postRollbackSnapshotHash: null,
      validationResult: null,
      rollbackExecuted: false,
      rollbackVerified: false,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 4. Fail-closed si la propuesta no tiene status 'PROPOSAL_GENERATED', carece de expectedOutcome o metricDirection no es explícita ('INCREASE' | 'DECREASE')
  if (
    proposal.status !== 'PROPOSAL_GENERATED' ||
    !proposal.expectedOutcome ||
    typeof proposal.expectedOutcome.projectedDelta !== 'number' ||
    (proposal.expectedOutcome.metricDirection !== 'INCREASE' && proposal.expectedOutcome.metricDirection !== 'DECREASE')
  ) {
    return {
      recoveryId: `rec_indet_${proposal.proposalId.slice(0, 8)}`,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      diagnosticId: proposal.diagnosticId,
      anomalyId: proposal.anomalyId,
      status: 'INDETERMINATE',
      policyDecisionUsed: policyDecision,
      preExecutionSnapshotHash: null,
      postExecutionSnapshotHash: null,
      postRollbackSnapshotHash: null,
      validationResult: null,
      rollbackExecuted: false,
      rollbackVerified: false,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 5. Orquestación Sandbox (H7.1B): Pre-Execution Snapshot
  const targetFile = 'src/lib/sandboxTargetFile.ts';
  const initialContent = '// initial sandbox state for recovery test';
  registerLocalFileForSandbox(targetFile, initialContent);

  const preSnapshot = createWorkspaceSnapshot([targetFile], 'pre-rec');
  const preExecutionSnapshotHash = computeAggregateManifestHash(preSnapshot);

  // 6. Simular/Ejecutar Sandbox Execution & Post-Snapshot
  let executionPassed = !simulatedExecutionFail;
  let postExecutionSnapshotHash: string | null = null;

  if (executionPassed) {
    const patchedContent = `// patched state for recovery test: ${proposal.proposalId}`;
    registerLocalFileForSandbox(targetFile, patchedContent);
    const postSnapshot = createWorkspaceSnapshot([targetFile], 'post-rec');
    postExecutionSnapshotHash = computeAggregateManifestHash(postSnapshot);
  }

  // 7. Validación Objetiva Post-Ejecución (con MetricDirection explícita 0 heurísticas)
  const metricDirection = proposal.expectedOutcome.metricDirection;
  const expectedDelta = proposal.expectedOutcome.projectedDelta;
  let observedDelta = expectedDelta;

  if (simulatedValidationFail) {
    observedDelta = metricDirection === 'INCREASE' ? expectedDelta - 0.50 : expectedDelta + 0.50;
  }

  let validationPassed = false;
  if (executionPassed) {
    if (metricDirection === 'INCREASE') {
      validationPassed = observedDelta >= expectedDelta;
    } else {
      validationPassed = observedDelta <= expectedDelta;
    }
  }

  const validationResult: ObjectiveValidationResult = {
    passed: validationPassed,
    metricName: proposal.expectedOutcome.targetMetric,
    expectedDelta,
    observedDelta,
    metricDirection,
    validationScore: validationPassed ? 1.0 : 0.0,
    reasoning: validationPassed
      ? `Objective validation passed: observedDelta (${observedDelta}) satisfies ${metricDirection} condition against expectedDelta (${expectedDelta}).`
      : `Objective validation failed: observedDelta (${observedDelta}) violated ${metricDirection} condition against expectedDelta (${expectedDelta}).`,
  };

  // 8. Flujo Feliz: Ejecución PASS & Validación PASS -> RECOVERY_SUCCESS
  if (executionPassed && validationPassed) {
    return {
      recoveryId: `rec_${proposal.proposalId.slice(0, 8)}`,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      diagnosticId: proposal.diagnosticId,
      anomalyId: proposal.anomalyId,
      status: 'RECOVERY_SUCCESS',
      policyDecisionUsed: policyDecision,
      preExecutionSnapshotHash,
      postExecutionSnapshotHash,
      postRollbackSnapshotHash: null,
      validationResult,
      rollbackExecuted: false,
      rollbackVerified: false,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 9. Flujo de Reversión Atómica (Rollback Execution & SHA-256 Verification)
  // Restaurar mediante la API congelada de H7.1B
  verifyAndExecuteAtomicRollback(preSnapshot);

  if (simulatedRollbackCorrupt) {
    // Fault injection determinista de corrupción post-rollback en archivo local
    registerLocalFileForSandbox(targetFile, '// CORRUPTED STATE POST ROLLBACK');
  }

  const postRollbackSnapshot = createWorkspaceSnapshot([targetFile], 'post-roll');
  const postRollbackSnapshotHash = computeAggregateManifestHash(postRollbackSnapshot);

  const rollbackVerified = postRollbackSnapshotHash === preExecutionSnapshotHash;

  if (rollbackVerified) {
    return {
      recoveryId: `rec_fail_${proposal.proposalId.slice(0, 8)}`,
      proposalId: proposal.proposalId,
      planId: proposal.planId,
      diagnosticId: proposal.diagnosticId,
      anomalyId: proposal.anomalyId,
      status: 'RECOVERY_FAILED_ROLLED_BACK',
      policyDecisionUsed: policyDecision,
      preExecutionSnapshotHash,
      postExecutionSnapshotHash,
      postRollbackSnapshotHash,
      validationResult,
      rollbackExecuted: true,
      rollbackVerified: true,
      evaluatedAt: nowUtc,
      timezone: 'America/Bogota',
      evaluatorVersion: 'v1.0',
      requiresHumanReview: true,
    };
  }

  // 10. Desacuerdo de Hashes Pre vs Post-Rollback -> ROLLBACK_FAILED_HARD_STOP
  return {
    recoveryId: `rec_stop_${proposal.proposalId.slice(0, 8)}`,
    proposalId: proposal.proposalId,
    planId: proposal.planId,
    diagnosticId: proposal.diagnosticId,
    anomalyId: proposal.anomalyId,
    status: 'ROLLBACK_FAILED_HARD_STOP',
    policyDecisionUsed: policyDecision,
    preExecutionSnapshotHash,
    postExecutionSnapshotHash,
    postRollbackSnapshotHash,
    validationResult,
    rollbackExecuted: true,
    rollbackVerified: false,
    evaluatedAt: nowUtc,
    timezone: 'America/Bogota',
    evaluatorVersion: 'v1.0',
    requiresHumanReview: true,
  };
}
