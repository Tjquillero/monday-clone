/**
 * Transactional Synchronization Service for Operational Weekly Planning (ADR-0008)
 * 
 * Converts RoutineWeeklyProjection (ADR-0007 output) into committed WeeklyPlan and WeeklyPlanItem records.
 * Enforces strict occurrence identity, human override protection, and DB-level idempotency.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { RoutineWeeklyProjection } from './routineScheduler';
import {
  WeeklyPlan,
  WeeklyPlanItem,
  WeeklyPlanItemInput,
  computeOccurrenceKey,
  mapRoutineAssignmentToItemInput,
} from '../types/weeklyPlan';

export interface SyncWeeklyPlanOptions {
  customNonWorkingDays?: string[];
  forceUpdate?: boolean;
}

export interface SyncWeeklyPlanResult {
  weeklyPlan: WeeklyPlan;
  insertedCount: number;
  updatedCount: number;
  cancelledCount: number;
  protectedCount: number;
  totalItems: number;
}

/**
 * Retrieves an existing WeeklyPlan header or creates a new one idempotently.
 */
export async function getOrCreateWeeklyPlan(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekStartDate: string,
  weekEndDate: string
): Promise<WeeklyPlan> {
  const gId = groupId || null;

  // 1. Try to fetch existing header
  let query = supabase
    .from('weekly_plans')
    .select('*')
    .eq('board_id', boardId)
    .eq('week_start_date', weekStartDate);

  if (gId) {
    query = query.eq('group_id', gId);
  } else {
    query = query.is('group_id', null);
  }

  const { data: existing, error: fetchErr } = await query.maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to query weekly_plans: ${fetchErr.message}`);
  }

  if (existing) {
    return existing as WeeklyPlan;
  }

  // 2. Insert new header idempotently
  const newPlanInput = {
    board_id: boardId,
    group_id: gId,
    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
    status: 'published',
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('weekly_plans')
    .insert(newPlanInput)
    .select('*')
    .single();

  if (insertErr) {
    // Handle concurrent insert race condition (uq_weekly_plan_board_group_week)
    if (insertErr.code === '23505' || insertErr.message.includes('unique constraint')) {
      let refetchQuery = supabase
        .from('weekly_plans')
        .select('*')
        .eq('board_id', boardId)
        .eq('week_start_date', weekStartDate);

      if (gId) {
        refetchQuery = refetchQuery.eq('group_id', gId);
      } else {
        refetchQuery = refetchQuery.is('group_id', null);
      }

      const { data: refetched } = await refetchQuery.maybeSingle();
      if (refetched) return refetched as WeeklyPlan;
    }
    throw new Error(`Failed to insert weekly_plan header: ${insertErr.message}`);
  }

  return inserted as WeeklyPlan;
}

/**
 * Synchronizes a RoutineWeeklyProjection into committed weekly_plan_items.
 * 
 * Rules:
 * 1. Protected items (status IN ('completed', 'in_progress') OR is_manual_override = true) are NEVER modified or cancelled.
 * 2. Unexecuted items (status = 'planned' & is_manual_override = false) no longer in projection transition to 'cancelled'.
 * 3. Cancelled items are terminal: they are NEVER uncanceled or resurrected to 'planned'.
 * 4. New projected occurrences not matching any existing item (active or cancelled) are inserted.
 */
export async function syncWeeklyPlanForBoard(
  supabase: SupabaseClient,
  boardId: string,
  groupId: string | null | undefined,
  weekStartDate: string,
  projection: RoutineWeeklyProjection,
  _options: SyncWeeklyPlanOptions = {}
): Promise<SyncWeeklyPlanResult> {
  const gId = groupId || null;

  // Step A: Ensure WeeklyPlan header exists
  const weeklyPlan = await getOrCreateWeeklyPlan(
    supabase,
    boardId,
    gId,
    projection.weekStartStr,
    projection.weekEndStr
  );

  // Step B: Fetch all existing plan items for this weekly_plan
  const { data: existingData, error: fetchErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('weekly_plan_id', weeklyPlan.id);

  if (fetchErr) {
    throw new Error(`Failed to fetch weekly_plan_items: ${fetchErr.message}`);
  }

  const existingItems = (existingData || []) as WeeklyPlanItem[];
  const existingMap = new Map<string, WeeklyPlanItem>();
  existingItems.forEach((item) => {
    existingMap.set(item.occurrence_key, item);
  });

  // Step C: Build projected item inputs
  const projectedInputs: WeeklyPlanItemInput[] = projection.assignments.map((assignment) =>
    mapRoutineAssignmentToItemInput(assignment, weeklyPlan.id, boardId, gId)
  );

  const projectedKeyMap = new Map<string, WeeklyPlanItemInput>();
  projectedInputs.forEach((item) => {
    projectedKeyMap.set(item.occurrence_key, item);
  });

  let insertedCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;
  let protectedCount = 0;

  const itemsToInsert: WeeklyPlanItemInput[] = [];
  const itemsToUpdate: Array<{ id: string; planned_qty: number; theoretical_jr: number }> = [];
  const itemIdsToCancel: string[] = [];

  // Step D: Evaluate existing items
  existingItems.forEach((item) => {
    const isProtected =
      item.status === 'completed' ||
      item.status === 'in_progress' ||
      item.is_manual_override;

    if (isProtected) {
      protectedCount++;
      return; // DO NOT TOUCH
    }

    if (item.status === 'cancelled') {
      // Terminal state - DO NOT TOUCH, DO NOT RESURRECT
      return;
    }

    // Item is 'planned' and is_manual_override = false
    const projMatch = projectedKeyMap.get(item.occurrence_key);
    if (projMatch) {
      // Still in projection -> Update quantities if changed
      if (item.planned_qty !== projMatch.planned_qty || item.theoretical_jr !== projMatch.theoretical_jr) {
        itemsToUpdate.push({
          id: item.id,
          planned_qty: projMatch.planned_qty,
          theoretical_jr: projMatch.theoretical_jr,
        });
      }
    } else {
      // Obsolete unexecuted item -> Transition to 'cancelled'
      itemIdsToCancel.push(item.id);
    }
  });

  // Step E: Identify new occurrences to insert
  projectedInputs.forEach((projItem) => {
    const existing = existingMap.get(projItem.occurrence_key);
    if (!existing) {
      itemsToInsert.push(projItem);
    }
  });

  // Step F: Execute DB Writes
  // 1. Perform Inserts
  if (itemsToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('weekly_plan_items')
      .insert(itemsToInsert);

    if (insertErr) {
      // If concurrent insert occurred, handle gracefully
      if (!insertErr.message.includes('unique constraint') && insertErr.code !== '23505') {
        throw new Error(`Failed to insert new weekly_plan_items: ${insertErr.message}`);
      }
    } else {
      insertedCount = itemsToInsert.length;
    }
  }

  // 2. Perform Updates for matching planned items
  for (const updateItem of itemsToUpdate) {
    const { error: updateErr } = await supabase
      .from('weekly_plan_items')
      .update({
        planned_qty: updateItem.planned_qty,
        theoretical_jr: updateItem.theoretical_jr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', updateItem.id);

    if (updateErr) {
      throw new Error(`Failed to update weekly_plan_item ${updateItem.id}: ${updateErr.message}`);
    }
    updatedCount++;
  }

  // 3. Perform Cancellations for obsolete unexecuted items
  for (const cancelId of itemIdsToCancel) {
    const { error: cancelErr } = await supabase
      .from('weekly_plan_items')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', cancelId);

    if (cancelErr) {
      throw new Error(`Failed to cancel obsolete weekly_plan_item ${cancelId}: ${cancelErr.message}`);
    }
    cancelledCount++;
  }

  // Step G: Fetch final count of items in plan
  const { count: totalItems } = await supabase
    .from('weekly_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('weekly_plan_id', weeklyPlan.id);

  return {
    weeklyPlan,
    insertedCount,
    updatedCount,
    cancelledCount,
    protectedCount,
    totalItems: totalItems || 0,
  };
}
