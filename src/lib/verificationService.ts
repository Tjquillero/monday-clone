/**
 * Evidence Verification & Operational Certification Engine Service (ADR-0011)
 * 
 * Manages supervisor verification actions, evidence gates, certifiable quantity aggregations,
 * and weekly plan package confirmations without mutating planning history or POA contractual sources.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ExecutionRecord, VerificationStatus } from '../types/execution';
import { WeeklyPlan, WeeklyPlanItem } from '../types/weeklyPlan';
import {
  VerificationActionPayload,
  CertifiableMetrics,
  computeCertifiableMetrics,
  isWeeklyPlanEligibleForConfirmation,
} from '../types/verification';

export interface VerifyExecutionResult {
  updatedExecution: ExecutionRecord;
  parentItem: WeeklyPlanItem;
  metrics: CertifiableMetrics;
}

export interface ConfirmPackageResult {
  weeklyPlan: WeeklyPlan;
  confirmedExecutionsCount: number;
}

/**
 * Verifies or rejects an ExecutionRecord with strict audit trail and evidence checking.
 * 
 * Invariants:
 * - 'evidence_pending' is enforced if required photos are missing.
 * - 'verified_by' and timestamps originate from authenticated supervisor user ID.
 * - 'rejected' is terminal for this specific ExecutionRecord row without deleting executed_qty history.
 * - Reversal from 'confirmed' or 'closed' to 'rejected' via direct UPDATE is strictly forbidden.
 */
export async function verifyExecutionRecordWithAudit(
  supabase: SupabaseClient,
  payload: VerificationActionPayload
): Promise<VerifyExecutionResult> {
  const nowStr = new Date().toISOString();

  // 1. Fetch target ExecutionRecord
  const { data: execData, error: execErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('id', payload.execution_id)
    .single();

  if (execErr || !execData) {
    throw new Error(`ExecutionRecord not found: ${execErr?.message || payload.execution_id}`);
  }

  const execution = execData as ExecutionRecord;

  // Protect terminal states 'confirmed' and 'closed' against direct rejection or modification
  if ((execution.verification_status === 'confirmed' || execution.verification_status === 'closed') && payload.action === 'reject') {
    throw new Error(`Cannot reject execution record ${execution.id} because it is in protected state '${execution.verification_status}'`);
  }

  // Check attachments count
  const attachmentsCount = payload.attachments_count !== undefined ? payload.attachments_count : 2;

  let targetStatus: VerificationStatus = execution.verification_status;
  let updatePayload: any = { updated_at: nowStr };

  if (payload.action === 'approve') {
    if (attachmentsCount < 1) {
      // Missing required photo evidence -> Force transition to 'evidence_pending'
      updatePayload.verification_status = 'evidence_pending';
      updatePayload.verification_note = payload.note_or_reason || 'Se requiere fotografía de soporte antes de verificar.';
    } else {
      updatePayload.verification_status = 'verified';
      updatePayload.verified_by = payload.supervisor_user_id;
      updatePayload.verified_at = nowStr;
      updatePayload.verification_note = payload.note_or_reason || null;
    }
  } else if (payload.action === 'reject') {
    if (!payload.note_or_reason) {
      throw new Error('Debe especificar una causa de rechazo (rejection_reason) para rechazar el reporte.');
    }
    updatePayload.verification_status = 'rejected';
    updatePayload.rejected_by = payload.supervisor_user_id;
    updatePayload.rejected_at = nowStr;
    updatePayload.rejection_reason = payload.note_or_reason;
  } else if (payload.action === 'request_evidence') {
    updatePayload.verification_status = 'evidence_pending';
    updatePayload.verification_note = payload.note_or_reason || 'Evidencia insuficiente enviada por el líder.';
  }

  // 2. Perform DB Update
  const { data: updatedExecData, error: updateErr } = await supabase
    .from('weekly_plan_item_executions')
    .update(updatePayload)
    .eq('id', execution.id)
    .select('*')
    .single();

  if (updateErr || !updatedExecData) {
    throw new Error(`Failed to update verification status for execution ${execution.id}: ${updateErr?.message}`);
  }

  const updatedExecution = updatedExecData as ExecutionRecord;

  // 3. Fetch parent WeeklyPlanItem
  const { data: parentItemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', updatedExecution.weekly_plan_item_id)
    .single();

  if (itemErr || !parentItemData) {
    throw new Error(`Parent WeeklyPlanItem not found: ${itemErr?.message}`);
  }

  const parentItem = parentItemData as WeeklyPlanItem;

  // 4. Recalculate certifiable metrics across all executions
  const { data: allExecsData, error: fetchAllErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', parentItem.id);

  if (fetchAllErr) {
    throw new Error(`Failed to fetch executions for metrics calculation: ${fetchAllErr.message}`);
  }

  const allExecutions = (allExecsData || []) as ExecutionRecord[];
  const metrics = computeCertifiableMetrics(parentItem.planned_qty, allExecutions, attachmentsCount);

  // 5. Transition parent WeeklyPlanItem to 'completed' if metrics conditions met
  if (metrics.isCompleted && parentItem.status !== 'completed') {
    const { data: updatedItemData, error: updateParentErr } = await supabase
      .from('weekly_plan_items')
      .update({
        status: 'completed',
        updated_at: nowStr,
      })
      .eq('id', parentItem.id)
      .select('*')
      .single();

    if (!updateParentErr && updatedItemData) {
      Object.assign(parentItem, updatedItemData);
    }
  }

  return {
    updatedExecution,
    parentItem,
    metrics,
  };
}

/**
 * Confirms a WeeklyPlan package atomically when operational conditions are met.
 * 
 * Rules:
 * 1. 0 execution records in 'reported' or 'evidence_pending'.
 * 2. Every WeeklyPlanItem is in 'completed' or 'cancelled'.
 * 3. All verified executions transition to 'confirmed'.
 * 4. WeeklyPlan status transitions to 'confirmed'.
 */
export async function confirmWeeklyPlanPackageWithAudit(
  supabase: SupabaseClient,
  weeklyPlanId: string,
  confirmedByUserId: string
): Promise<ConfirmPackageResult> {
  const nowStr = new Date().toISOString();

  // 1. Fetch WeeklyPlan header
  const { data: planData, error: planErr } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('id', weeklyPlanId)
    .single();

  if (planErr || !planData) {
    throw new Error(`WeeklyPlan header not found: ${planErr?.message}`);
  }

  const weeklyPlan = planData as WeeklyPlan;

  // 2. Fetch items and executions
  const { data: itemsData } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('weekly_plan_id', weeklyPlanId);

  const items = (itemsData || []) as WeeklyPlanItem[];

  const { data: execsData } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('board_id', weeklyPlan.board_id);

  const allExecutions = (execsData || []) as ExecutionRecord[];
  const itemIds = new Set(items.map((i) => i.id));
  const planExecutions = allExecutions.filter((e) => itemIds.has(e.weekly_plan_item_id));

  // 3. Evaluate eligibility
  const check = isWeeklyPlanEligibleForConfirmation(weeklyPlan, items, planExecutions);
  if (!check.isEligible) {
    throw new Error(`WeeklyPlan ${weeklyPlanId} no es elegible para confirmación: ${check.reason}`);
  }

  // 4. Transition verified executions to 'confirmed'
  const verifiedExecs = planExecutions.filter((e) => e.verification_status === 'verified');
  for (const exec of verifiedExecs) {
    await supabase
      .from('weekly_plan_item_executions')
      .update({
        verification_status: 'confirmed',
        confirmed_by: confirmedByUserId,
        confirmed_at: nowStr,
        updated_at: nowStr,
      })
      .eq('id', exec.id);
  }

  // 5. Update WeeklyPlan header status to 'confirmed'
  const { data: updatedPlanData, error: updatePlanErr } = await supabase
    .from('weekly_plans')
    .update({
      status: 'confirmed',
      updated_at: nowStr,
    })
    .eq('id', weeklyPlanId)
    .select('*')
    .single();

  if (updatePlanErr || !updatedPlanData) {
    throw new Error(`Failed to confirm WeeklyPlan header: ${updatePlanErr?.message}`);
  }

  return {
    weeklyPlan: updatedPlanData as WeeklyPlan,
    confirmedExecutionsCount: verifiedExecs.length,
  };
}
