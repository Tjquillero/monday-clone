/**
 * Types & Domain Helpers for Operational Field Execution (ADR-0009)
 */

export type VerificationStatus =
  | 'reported'
  | 'evidence_pending'
  | 'verified'
  | 'confirmed'
  | 'closed'
  | 'rejected';

import { OperationalResourceItem } from '../lib/resourceConsumptionControlService';

export type DailyActivityStatus =
  | 'PENDIENTE'
  | 'EN_CURSO'
  | 'CONTINUA_MANANA'
  | 'TERMINADA_HOY'
  | 'NO_EJECUTADA';

export interface ExecutionRecord {
  id: string;
  weekly_plan_item_id: string;
  board_id: string;
  group_id?: string | null;
  execution_date: string; // YYYY-MM-DD
  executed_qty: number;
  worker_count: number;
  hours_worked: number;
  jornales_used?: number;
  reported_by: string;
  verified_by?: string | null;
  verified_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  closed_by?: string | null;
  closed_at?: string | null;
  source_mutation_id?: string | null;
  crew_id_snapshot?: string | null;
  verification_note?: string | null;
  rejection_reason?: string | null;
  verification_status: VerificationStatus;
  status?: string; // Physical DB column (ADR-0011) SoT
  used_resources?: OperationalResourceItem[];
  created_at?: string;
  updated_at?: string;
}

export interface ExecutionReportInput {
  weekly_plan_item_id: string;
  board_id: string;
  group_id?: string | null;
  execution_date: string;
  executed_qty: number;
  worker_count?: number;
  hours_worked?: number;
  reported_by: string;
  source_mutation_id?: string | null;
  crew_id_snapshot?: string | null;
  verification_status?: VerificationStatus;
  used_resources?: OperationalResourceItem[];
  continuation_decision?: 'CONTINUA_MANANA' | 'TERMINADA_HOY';
}

export interface ExecutionMetrics {
  totalReportedQty: number;
  certifiableExecutedQty: number; // SUM(executed_qty WHERE status = 'verified')
  pendingVerificationQty: number;
  remainingPlannedQty: number;
  overExecutedQty: number;
  contractualCertifiableQty: number; // MIN(certifiableExecutedQty, plannedQty)
  isCompleted: boolean;
}

/**
 * Computes execution metrics deterministically from a list of ExecutionRecord events.
 */
export function calculateExecutionMetrics(
  plannedQty: number,
  executions: ExecutionRecord[]
): ExecutionMetrics {
  // Non-rejected executions count towards reported total
  const activeExecutions = executions.filter((e) => e.verification_status !== 'rejected');

  const totalReportedQty = activeExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

  // ONLY verified executions count towards certifiable quantity
  const verifiedExecutions = activeExecutions.filter((e) => e.verification_status === 'verified' || e.verification_status === 'confirmed' || e.verification_status === 'closed');
  const certifiableExecutedQty = verifiedExecutions.reduce((acc, curr) => acc + (curr.executed_qty || 0), 0);

  const pendingVerificationQty = Math.max(0, totalReportedQty - certifiableExecutedQty);
  const remainingPlannedQty = Math.max(0, plannedQty - certifiableExecutedQty);
  const overExecutedQty = Math.max(0, certifiableExecutedQty - plannedQty);
  const contractualCertifiableQty = Math.min(certifiableExecutedQty, plannedQty);

  // Completed if certifiable quantity reaches or exceeds planned quantity AND there are no pending unverified executions
  const hasPendingUnverified = activeExecutions.some(
    (e) => e.verification_status === 'reported' || e.verification_status === 'evidence_pending'
  );

  const isCompleted = certifiableExecutedQty >= plannedQty && !hasPendingUnverified;

  return {
    totalReportedQty,
    certifiableExecutedQty,
    pendingVerificationQty,
    remainingPlannedQty,
    overExecutedQty,
    contractualCertifiableQty,
    isCompleted,
  };
}
