/**
 * Types & Domain Helpers for Evidence Verification & Operational Certification (ADR-0011)
 */

import { ExecutionRecord, VerificationStatus } from './execution';
import { WeeklyPlan, WeeklyPlanItem } from './weeklyPlan';

export type VerificationAction = 'approve' | 'reject' | 'request_evidence';

export interface VerificationActionPayload {
  execution_id: string;
  supervisor_user_id: string; // Authenticated session user ID
  action: VerificationAction;
  note_or_reason?: string;
  attachments_count?: number; // Count of verified photos (phase 'before' / 'after')
}

export interface CertifiableMetrics {
  totalReportedQty: number;
  certifiableExecutedQty: number;   // SUM(executed_qty WHERE status IN ('verified', 'confirmed', 'closed'))
  rejectedExecutedQty: number;      // SUM(executed_qty WHERE status = 'rejected')
  pendingVerificationQty: number;   // SUM(executed_qty WHERE status IN ('reported', 'evidence_pending'))
  remainingPlannedQty: number;     // MAX(0, plannedQty - certifiableExecutedQty)
  overExecutedQty: number;          // MAX(0, certifiableExecutedQty - plannedQty)
  contractualCertifiableQty: number; // MIN(certifiableExecutedQty, plannedQty)
  isCompleted: boolean;
}

export interface VerificationCheckResult {
  hasRequiredEvidence: boolean;
  missingPhases: Array<'before' | 'after'>;
}

/**
 * Computes certifiable metrics deterministically from execution records.
 * Single source of truth is ExecutionRecord.executed_qty + verification_status.
 */
export function computeCertifiableMetrics(
  plannedQty: number,
  executions: ExecutionRecord[],
  attachmentsCount: number = 2
): CertifiableMetrics {
  const totalReportedQty = executions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

  // Certifiable = SUM(executed_qty WHERE verification_status IN ('verified', 'confirmed', 'closed'))
  const verifiedExecutions = executions.filter(
    (e) => e.verification_status === 'verified' || e.verification_status === 'confirmed' || e.verification_status === 'closed'
  );
  const certifiableExecutedQty = verifiedExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

  // Rejected = SUM(executed_qty WHERE verification_status = 'rejected')
  const rejectedExecutions = executions.filter((e) => e.verification_status === 'rejected');
  const rejectedExecutedQty = rejectedExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

  // Pending = SUM(executed_qty WHERE verification_status IN ('reported', 'evidence_pending'))
  const pendingExecutions = executions.filter(
    (e) => e.verification_status === 'reported' || e.verification_status === 'evidence_pending'
  );
  const pendingVerificationQty = pendingExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

  const remainingPlannedQty = Math.max(0, plannedQty - certifiableExecutedQty);
  const overExecutedQty = Math.max(0, certifiableExecutedQty - plannedQty);
  const contractualCertifiableQty = Math.min(certifiableExecutedQty, plannedQty);

  // Item is completed ONLY when certifiable quantity reaches planned quantity AND 0 pending/unverified executions remain
  const hasPendingUnverified = pendingExecutions.length > 0;
  const isCompleted = certifiableExecutedQty >= plannedQty && !hasPendingUnverified && attachmentsCount >= 1;

  return {
    totalReportedQty,
    certifiableExecutedQty,
    rejectedExecutedQty,
    pendingVerificationQty,
    remainingPlannedQty,
    overExecutedQty,
    contractualCertifiableQty,
    isCompleted,
  };
}

/**
 * Validates whether a WeeklyPlan package is eligible to transition to 'confirmed'.
 * Condition:
 * 1. 0 execution records in 'reported' or 'evidence_pending'.
 * 2. Every WeeklyPlanItem is in a terminal state ('completed' or 'cancelled').
 */
export function isWeeklyPlanEligibleForConfirmation(
  weeklyPlan: WeeklyPlan,
  items: WeeklyPlanItem[],
  executions: ExecutionRecord[]
): { isEligible: boolean; reason?: string } {
  if (weeklyPlan.status === 'confirmed' || weeklyPlan.status === 'closed') {
    return { isEligible: true };
  }

  // Rule 1: 0 unverified executions
  const pendingExecs = executions.filter(
    (e) => e.verification_status === 'reported' || e.verification_status === 'evidence_pending'
  );

  if (pendingExecs.length > 0) {
    return {
      isEligible: false,
      reason: `Existen ${pendingExecs.length} ejecuciones pendientes de verificación por el supervisor.`,
    };
  }

  // Rule 2: Every WeeklyPlanItem is completed or cancelled
  const incompleteItems = items.filter((item) => item.status === 'planned' || item.status === 'in_progress');
  if (incompleteItems.length > 0) {
    return {
      isEligible: false,
      reason: `Existen ${incompleteItems.length} ítems en planificación no completados ni cancelados.`,
    };
  }

  return { isEligible: true };
}
