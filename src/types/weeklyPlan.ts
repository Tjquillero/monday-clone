/**
 * Types & Domain Helpers for Operational Weekly Planning (ADR-0008)
 */

import { DailyRoutineAssignment } from '../lib/routineScheduler';

export type SourceType = 'ROUTINE' | 'INCIDENT' | 'MANUAL';
export type ItemLifecycleStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type PlanHeaderStatus = 'draft' | 'published' | 'in_progress' | 'ready_for_confirmation' | 'confirmed' | 'closed' | 'cancelled';

export interface WeeklyPlan {
  id: string;
  board_id: string;
  group_id?: string | null;
  week_start_date: string; // YYYY-MM-DD
  week_end_date: string; // YYYY-MM-DD
  status: PlanHeaderStatus;
  created_at?: string;
  updated_at?: string;
}

export interface WeeklyPlanItem {
  id: string;
  weekly_plan_id: string;
  board_id: string;
  group_id?: string | null;
  activity_key: string;
  name: string;
  zone: string;
  unit: string;
  planned_date: string; // YYYY-MM-DD
  planned_qty: number;
  theoretical_jr: number;
  source_type: SourceType;
  routine_reference: string;
  occurrence_key: string;
  crew_id?: string | null;
  is_manual_override: boolean;
  override_reason?: string | null;
  status: ItemLifecycleStatus;
  created_at?: string;
  updated_at?: string;
}

export interface WeeklyPlanItemInput {
  weekly_plan_id: string;
  board_id: string;
  group_id?: string | null;
  activity_key: string;
  name: string;
  zone: string;
  unit: string;
  planned_date: string;
  planned_qty: number;
  theoretical_jr: number;
  source_type: SourceType;
  routine_reference: string;
  occurrence_key: string;
  crew_id?: string | null;
  is_manual_override?: boolean;
  override_reason?: string | null;
  status: ItemLifecycleStatus;
}

/**
 * Computes the deterministic DB-level occurrence key for an operational assignment.
 * Occurrence Key = board_id + group_id + routine_ref + activity_key + planned_date + pattern_offset
 */
export function computeOccurrenceKey(
  boardId: string,
  groupId: string | null | undefined,
  routineRef: string,
  activityKey: string,
  plannedDate: string,
  patternOffset?: string
): string {
  const gId = groupId || 'site_all';
  const offset = patternOffset || 'default';
  return `${boardId}__${gId}__${routineRef}__${activityKey}__${plannedDate}__${offset}`;
}

/**
 * Transforms a DailyRoutineAssignment (ADR-0007 output) into a WeeklyPlanItemInput (ADR-0008 input).
 */
export function mapRoutineAssignmentToItemInput(
  assignment: DailyRoutineAssignment,
  weeklyPlanId: string,
  boardId: string,
  groupId?: string | null
): WeeklyPlanItemInput {
  const routineRef = assignment.activity_key; // Routine template reference
  const occurrenceKey = computeOccurrenceKey(
    boardId,
    groupId,
    routineRef,
    assignment.activity_key,
    assignment.dateStr
  );

  return {
    weekly_plan_id: weeklyPlanId,
    board_id: boardId,
    group_id: groupId || null,
    activity_key: assignment.activity_key,
    name: assignment.name,
    zone: assignment.zone,
    unit: assignment.unit,
    planned_date: assignment.dateStr,
    planned_qty: assignment.cantidad,
    theoretical_jr: assignment.theoretical_jr,
    source_type: 'ROUTINE',
    routine_reference: routineRef,
    occurrence_key: occurrenceKey,
    is_manual_override: false,
    status: 'planned',
  };
}
