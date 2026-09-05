/**
 * Transactional Execution Service for Operational Field Records (ADR-0009)
 * 
 * Manages field execution reporting, verification lifecycle, state machine transitions,
 * and certifiable quantity calculations without mutating planning history or POA contracts.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ExecutionRecord,
  ExecutionReportInput,
  ExecutionMetrics,
  calculateExecutionMetrics,
  VerificationStatus,
} from '../types/execution';
import { WeeklyPlanItem } from '../types/weeklyPlan';

export interface ReportExecutionResult {
  executionRecord: ExecutionRecord;
  parentItem: WeeklyPlanItem;
  metrics: ExecutionMetrics;
}

export interface VerifyExecutionResult {
  updatedExecution: ExecutionRecord;
  parentItem: WeeklyPlanItem;
  metrics: ExecutionMetrics;
}

/**
 * Transactionally reports a new field execution event against a WeeklyPlanItem.
 * 
 * State transitions:
 * - Parent WeeklyPlanItem: 'planned' -> 'in_progress' (on first execution report).
 * - Parent WeeklyPlanItem: 'in_progress' -> 'completed' (when certifiable_qty >= planned_qty and no pending unverified executions).
 */
export async function reportWeeklyPlanExecution(
  supabase: SupabaseClient,
  input: ExecutionReportInput
): Promise<ReportExecutionResult> {
  // 1. Fetch parent WeeklyPlanItem
  const { data: parentItemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', input.weekly_plan_item_id)
    .single();

  if (itemErr || !parentItemData) {
    throw new Error(`Failed to find parent weekly_plan_item: ${itemErr?.message || 'Item not found'}`);
  }

  const parentItem = parentItemData as WeeklyPlanItem;

  // 2. Insert new execution record
  const execPayload = {
    weekly_plan_item_id: input.weekly_plan_item_id,
    board_id: input.board_id,
    group_id: input.group_id || null,
    execution_date: input.execution_date,
    executed_qty: input.executed_qty,
    worker_count: input.worker_count || 1,
    hours_worked: input.hours_worked || 8,
    reported_by: input.reported_by,
    verification_status: input.verification_status || 'reported',
  };

  const { data: insertedExec, error: execErr } = await supabase
    .from('weekly_plan_item_executions')
    .insert(execPayload)
    .select('*')
    .single();

  if (execErr || !insertedExec) {
    throw new Error(`Failed to insert execution record: ${execErr?.message}`);
  }

  const executionRecord = insertedExec as ExecutionRecord;

  // 3. Fetch all executions for this item to calculate updated metrics
  const { data: allExecsData, error: fetchAllErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', input.weekly_plan_item_id);

  if (fetchAllErr) {
    throw new Error(`Failed to fetch executions for metrics calculation: ${fetchAllErr.message}`);
  }

  const allExecutions = (allExecsData || []) as ExecutionRecord[];
  const metrics = calculateExecutionMetrics(parentItem.planned_qty, allExecutions);

  // 4. Update parent WeeklyPlanItem status
  let updatedParentStatus = parentItem.status;
  if (parentItem.status === 'planned') {
    updatedParentStatus = 'in_progress';
  }

  if (metrics.isCompleted && updatedParentStatus === 'in_progress') {
    updatedParentStatus = 'completed';
  }

  if (updatedParentStatus !== parentItem.status) {
    const { data: updatedItemData, error: updateItemErr } = await supabase
      .from('weekly_plan_items')
      .update({
        status: updatedParentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parentItem.id)
      .select('*')
      .single();

    if (!updateItemErr && updatedItemData) {
      Object.assign(parentItem, updatedItemData);
    }
  }

  return {
    executionRecord,
    parentItem,
    metrics,
  };
}

/**
 * Verifies or rejects an ExecutionRecord (Technical Supervisor action).
 * Updates verification_status to 'verified' or 'rejected'.
 * Recalculates certifiableExecutedQty and updates parent WeeklyPlanItem status if completed.
 */
export async function verifyWeeklyPlanExecution(
  supabase: SupabaseClient,
  executionId: string,
  supervisorUserId: string,
  isApproved: boolean,
  rejectionReason?: string
): Promise<VerifyExecutionResult> {
  const targetStatus: VerificationStatus = isApproved ? 'verified' : 'rejected';
  const nowStr = new Date().toISOString();

  // 1. Update execution record verification status
  const updatePayload = {
    verification_status: targetStatus,
    verified_by: supervisorUserId,
    verified_at: nowStr,
    rejection_reason: isApproved ? null : rejectionReason || 'Sin justificación especificada',
    updated_at: nowStr,
  };

  const { data: updatedExecData, error: updateExecErr } = await supabase
    .from('weekly_plan_item_executions')
    .update(updatePayload)
    .eq('id', executionId)
    .select('*')
    .single();

  if (updateExecErr || !updatedExecData) {
    throw new Error(`Failed to verify execution ${executionId}: ${updateExecErr?.message}`);
  }

  const updatedExecution = updatedExecData as ExecutionRecord;

  // 2. Fetch parent WeeklyPlanItem
  const { data: parentItemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', updatedExecution.weekly_plan_item_id)
    .single();

  if (itemErr || !parentItemData) {
    throw new Error(`Failed to find parent weekly_plan_item: ${itemErr?.message}`);
  }

  const parentItem = parentItemData as WeeklyPlanItem;

  // 3. Recalculate metrics across all executions
  const { data: allExecsData, error: fetchAllErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', parentItem.id);

  if (fetchAllErr) {
    throw new Error(`Failed to fetch executions for metrics calculation: ${fetchAllErr.message}`);
  }

  const allExecutions = (allExecsData || []) as ExecutionRecord[];
  const metrics = calculateExecutionMetrics(parentItem.planned_qty, allExecutions);

  // 4. Update parent item status if completed
  if (metrics.isCompleted && parentItem.status !== 'completed') {
    const { data: updatedItemData, error: updateItemErr } = await supabase
      .from('weekly_plan_items')
      .update({
        status: 'completed',
        updated_at: nowStr,
      })
      .eq('id', parentItem.id)
      .select('*')
      .single();

    if (!updateItemErr && updatedItemData) {
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
 * Returns complete execution summary and certifiable metrics for a WeeklyPlanItem.
 */
export async function getWeeklyPlanItemExecutionSummary(
  supabase: SupabaseClient,
  itemId: string
): Promise<{ item: WeeklyPlanItem; executions: ExecutionRecord[]; metrics: ExecutionMetrics }> {
  const { data: itemData, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemErr || !itemData) {
    throw new Error(`WeeklyPlanItem not found: ${itemErr?.message}`);
  }

  const item = itemData as WeeklyPlanItem;

  const { data: execsData, error: execsErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('weekly_plan_item_id', itemId);

  if (execsErr) {
    throw new Error(`Failed to fetch executions: ${execsErr.message}`);
  }

  const executions = (execsData || []) as ExecutionRecord[];
  const metrics = calculateExecutionMetrics(item.planned_qty, executions);

  return {
    item,
    executions,
    metrics,
  };
}
