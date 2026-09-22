import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  buildSupervisorExecutiveDashboard,
  SupervisorExecutiveDashboardSummary,
} from '@/lib/supervisorExecutiveDashboardService';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { Crew, PersonnelSiteAssignment } from '@/types/crew';
import { MinimalExecutionRecord } from '@/lib/resourceConsumptionControlService';

/**
 * Hook de Lectura Pura (React Query) para el Dashboard Ejecutivo de Supervisión (Fase 4 · Módulo 4).
 * Consume determinísticamente datos soberanos sin mutaciones a la BD.
 */
export function useSupervisorExecutiveDashboard(boardId: string | null | undefined) {
  return useQuery<SupervisorExecutiveDashboardSummary | null>({
    queryKey: ['supervisor-executive-dashboard', boardId],
    queryFn: async () => {
      if (!boardId) return null;

      // 1. Cargar WeeklyPlanItems del tablero
      const { data: planItemsData, error: itemsErr } = await supabase
        .from('weekly_plan_items')
        .select('*')
        .eq('board_id', boardId);

      if (itemsErr) throw itemsErr;

      const planItems: WeeklyPlanItem[] = (planItemsData ?? []).map((i: any) => ({
        id: i.id,
        weekly_plan_id: i.weekly_plan_id || '',
        board_id: i.board_id || '',
        activity_key: i.activity_key || '',
        name: i.name || '',
        zone: i.zone || '',
        unit: i.unit || '',
        planned_date: i.planned_date || '',
        planned_qty: Number(i.planned_qty ?? 0),
        theoretical_jr: Number(i.theoretical_jr ?? 0),
        source_type: i.source_type || 'ROUTINE',
        routine_reference: i.routine_reference || '',
        occurrence_key: i.occurrence_key || `${i.board_id}__${i.id}`,
        crew_id: i.crew_id || null,
        is_manual_override: Boolean(i.is_manual_override),
        status: i.status || 'planned',
        created_at: i.created_at,
        updated_at: i.updated_at,
      }));

      // 2. Cargar Ejecuciones y Verificaciones del tablero
      const itemIds = planItems.map((i) => i.id);
      let executions: MinimalExecutionRecord[] = [];

      if (itemIds.length > 0) {
        const { data: execsData, error: execsErr } = await supabase
          .from('execution_records')
          .select('id, weekly_plan_item_id, occurrence_key, executed_qty, executed_jr, status, verification_status')
          .in('weekly_plan_item_id', itemIds);

        if (!execsErr && execsData) {
          executions = execsData.map((e: any) => ({
            id: e.id,
            weekly_plan_item_id: e.weekly_plan_item_id,
            occurrence_key: e.occurrence_key,
            executed_qty: Number(e.executed_qty ?? 0),
            executed_jr: Number(e.executed_jr ?? 0),
            verification_status: e.verification_status,
            status: e.status,
          }));
        }
      }

      // 3. Cargar Cuadrillas del tablero
      const { data: crewsData, error: crewsErr } = await supabase
        .from('crews')
        .select('*')
        .eq('board_id', boardId)
        .eq('is_active', true);

      if (crewsErr) throw crewsErr;

      const crews: Crew[] = (crewsData ?? []).map((c: any) => ({
        id: c.id,
        board_id: c.board_id,
        version_id: c.version_id,
        name: c.name,
        code: c.code,
        leader_id: c.leader_id,
        is_active: c.is_active ?? true,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));

      // 4. Construir Dashboard determinístico puro
      return buildSupervisorExecutiveDashboard({
        boardId,
        planItems,
        executions,
        crews,
      });
    },
    enabled: Boolean(boardId),
    staleTime: 1000 * 60 * 5, // 5 minutos cache lectura
  });
}
