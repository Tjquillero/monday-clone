import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools de cronograma — ver src/services/ai/domainTools/actas.ts para
// la explicación general de esta capa (Tool Registry -> DomainTools -> RPC).

export interface DelayedWeeklyPlanDto {
  weeklyPlanId: string;
  boardId: string;
  weekStart: string;
  weekEnd: string;
  status: string;
  activityCode: string;
  activityName: string;
  zoneName: string;
  daysLate: number;
}

export async function getDelayedWeeklyPlans(
  supabase: SupabaseClient,
  boardId: string
): Promise<DelayedWeeklyPlanDto[]> {
  const { data, error } = await supabase.rpc('get_delayed_weekly_plans', {
    p_board_id: boardId,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    weekly_plan_id: string;
    board_id: string;
    week_start: string;
    week_end: string;
    status: string;
    activity_code: string;
    activity_name: string;
    zone_name: string;
    days_late: number;
  }>;

  return rows.map((row) => ({
    weeklyPlanId: row.weekly_plan_id,
    boardId: row.board_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    status: row.status,
    activityCode: row.activity_code,
    activityName: row.activity_name,
    zoneName: row.zone_name,
    daysLate: row.days_late,
  }));
}
