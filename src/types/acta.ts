/**
 * Types & Domain Helpers for Contractual Certification & Billing Actas (ADR-0012)
 */

import { ExecutionRecord } from './execution';

export type ActaEstado = 'draft' | 'issued' | 'closed';

export interface Acta {
  id: string;
  board_id: string;
  numero?: number | null;
  estado: ActaEstado;
  fecha?: string | null;
  observaciones?: string | null;
  generated_by: string;
  generated_at: string;
  issued_by?: string | null;
  issued_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ActaItem {
  id: string;
  acta_id: string;
  poa_activity_id: string;
  descripcion_snapshot: string;
  unidad_snapshot: string;
  precio_unitario_snapshot: number;
  activity_key_snapshot?: string | null;
  zone_snapshot?: string | null;
  cantidad_facturada: number;
  valor_total?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ActaItemSource {
  id: string;
  acta_item_id: string;
  execution_id: string;
  cantidad_consumida: number;
  created_at?: string;
}

export interface ContractualBillingSummary {
  boardId: string;
  poaActivityId: string;
  poaQuantity: number;
  poaUnitPrice: number;
  totalCertifiableExecutedQty: number;
  totalContractualCertifiableQty: number; // MIN(totalCertifiableExecutedQty, poaQuantity)
  totalBilledQty: number;                // SUM(cantidad_facturada across issued Actas)
  pendingBillableQty: number;             // MAX(0, totalContractualCertifiableQty - totalBilledQty)
  overExecutedQty: number;                // MAX(0, totalCertifiableExecutedQty - poaQuantity) [Isolating overage]
}

/**
 * Calculates available billable balance for a single ExecutionRecord based on existing sources.
 * Invariant: ExecutionRecord.executed_qty remains UNCHANGED physically.
 */
export function calculateAvailableExecutionBalance(
  execution: ExecutionRecord,
  existingSourcesForExecution: ActaItemSource[]
): number {
  // Only executions with authority (verified, confirmed, closed) can contribute
  const isValidStatus =
    execution.verification_status === 'verified' ||
    execution.verification_status === 'confirmed' ||
    execution.verification_status === 'closed';

  if (!isValidStatus) {
    return 0;
  }

  const totalConsumed = existingSourcesForExecution.reduce(
    (acc, curr) => acc + (curr.cantidad_consumida || 0),
    0
  );

  return Math.max(0, execution.executed_qty - totalConsumed);
}

/**
 * Calculates contractual certifiable quantity, enforcing that over-execution does NOT auto-grant
 * billing authority beyond POA activity contract volume.
 */
export function calculateContractualCertifiableQty(
  certifiableExecutedQty: number,
  poaQuantity: number,
  alreadyBilledForPoa: number = 0
): { contractualCertifiableQty: number; overageQty: number; availablePoaAllowance: number } {
  const availablePoaAllowance = Math.max(0, poaQuantity - alreadyBilledForPoa);
  const contractualCertifiableQty = Math.min(certifiableExecutedQty, availablePoaAllowance);
  const overageQty = Math.max(0, certifiableExecutedQty - poaQuantity);

  return {
    contractualCertifiableQty,
    overageQty,
    availablePoaAllowance,
  };
}
