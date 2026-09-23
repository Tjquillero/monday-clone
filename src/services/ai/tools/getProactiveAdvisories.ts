import type { AiToolDefinition } from './types';
import {
  evaluateProactive3DDiscrepancies,
  POAItemContract,
} from '@/lib/operationalAdvisoryProactiveService';
import { OperationalRecommendation } from '@/types/operationalAdvisory';
import { DecisionRecord } from '@/types/decisionGovernance';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';

export const getProactiveAdvisoriesTool: AiToolDefinition<{ board_id: string }, OperationalRecommendation[]> = {
  name: 'get_proactive_advisories',
  description:
    'Obtiene las recomendaciones operacionales proactivas y discrepancias tridimensionales detectadas por el observador de MantenixAgent (POA ↔ WeeklyPlan ↔ Execution). Retorna la lista de recomendaciones en estado PROPOSED con su justificación cuantitativa e impacto proyectado sin realizar mutaciones.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      board_id: { type: 'string', description: 'UUID del board o tablero principal.' },
    },
    required: ['board_id'],
  },
  sideEffects: false,
  requiresConfirmation: false,
  execute: async (supabase, params) => {
    const { board_id } = params;

    // 1. Cargar weekly plan items
    const { data: planData } = await supabase
      .from('weekly_plan_items')
      .select('*')
      .eq('board_id', board_id);

    const weeklyPlanItems: WeeklyPlanItem[] = (planData || []).map((item) => ({
      id: item.id,
      weekly_plan_id: item.weekly_plan_id,
      board_id: item.board_id,
      group_id: item.group_id,
      activity_key: item.activity_key,
      name: item.name,
      zone: item.zone || 'General',
      unit: item.unit || 'UND',
      planned_date: item.planned_date,
      planned_qty: Number(item.planned_qty || 0),
      theoretical_jr: Number(item.theoretical_jr || 0),
      source_type: item.source_type || 'ROUTINE',
      routine_reference: item.routine_reference || '',
      occurrence_key: item.occurrence_key || '',
      crew_id: item.crew_id,
      is_manual_override: item.is_manual_override || false,
      status: item.status || 'planned',
    }));

    // 2. Cargar ejecuciones
    const planItemIds = weeklyPlanItems.map((i) => i.id);
    let executionRecords: ExecutionRecord[] = [];
    if (planItemIds.length > 0) {
      const { data: execData } = await supabase
        .from('weekly_plan_item_executions')
        .select('*')
        .in('weekly_plan_item_id', planItemIds);

      executionRecords = (execData || []).map((e) => ({
        id: e.id,
        weekly_plan_item_id: e.weekly_plan_item_id,
        board_id: e.board_id,
        execution_date: e.execution_date,
        executed_qty: Number(e.executed_qty || 0),
        worker_count: Number(e.worker_count || 1),
        hours_worked: Number(e.hours_worked || 8),
        reported_by: e.reported_by,
        verification_status: e.verification_status,
      }));
    }

    // 3. Cargar POA items
    const { data: poaData } = await supabase
      .from('items')
      .select('id, key, title, custom_columns')
      .eq('board_id', board_id);

    const poaItems: POAItemContract[] = (poaData || []).map((item) => {
      const cols = (item.custom_columns as Record<string, unknown>) || {};
      return {
        activityKey: String(item.key || item.id),
        name: String(item.title || 'Actividad POA'),
        zone: String(cols.zona || cols.zone || 'General'),
        unit: String(cols.unit || cols.unidad || 'UND'),
        contractualQty: Number(cols.cant || cols.cantidad || 0),
        contractualFrequency: Number(cols.frecuencia || 4),
      };
    });

    // 4. Cargar decisiones previas
    const { data: decisionData } = await supabase
      .from('operational_advisory_decisions')
      .select('*')
      .eq('board_id', board_id);

    const priorDecisions: DecisionRecord[] = (decisionData || []).map((d) => ({
      id: d.id,
      decisionMutationId: d.decision_mutation_id,
      recommendationId: d.recommendation_id,
      recommendationKey: d.recommendation_key,
      decisionSequenceNumber: d.decision_sequence_number,
      boardId: d.board_id,
      actorUserId: d.actor_user_id,
      actorRole: d.actor_role,
      decisionStatus: d.decision_status,
      decisionReason: d.decision_reason,
      postponedUntilIso: d.postponed_until_iso,
      decisionTimestamp: d.decision_timestamp,
      recommendationSnapshot: d.recommendation_snapshot as OperationalRecommendation,
      actionStatus: d.action_status,
      executionSnapshot: d.execution_snapshot,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));

    // 5. Evaluar discrepancias proactivas de forma pura en memoria
    const result = evaluateProactive3DDiscrepancies({
      boardId: board_id,
      poaItems,
      weeklyPlanItems,
      executionRecords,
      priorDecisions,
    });

    return result.recommendations;
  },
};
