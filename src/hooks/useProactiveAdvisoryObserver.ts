'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  evaluateProactive3DDiscrepancies,
  POAItemContract,
} from '@/lib/operationalAdvisoryProactiveService';
import { OperationalRecommendation } from '@/types/operationalAdvisory';
import { ProactiveAdvisoryFilterOptions } from '@/types/proactiveAdvisory';
import { DecisionRecord } from '@/types/decisionGovernance';
import { WeeklyPlanItem } from '@/types/weeklyPlan';
import { ExecutionRecord } from '@/types/execution';

const DISMISSED_STORAGE_KEY_PREFIX = 'mantenix_dismissed_advisory_';

/**
 * Hook Consultivo Reactivo: Superficie Operativa de Campo (/my-work)
 * Observa eventos de superficie/montaje y proyecta recomendaciones proactivas gobernadas.
 * 0 polling por setInterval. Cooldown determinista de 24h por UI.
 */
export function useProactiveAdvisoryObserver(
  boardId: string | null,
  options?: ProactiveAdvisoryFilterOptions
) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !boardId) return new Set<string>();
    try {
      const stored = localStorage.getItem(`${DISMISSED_STORAGE_KEY_PREFIX}${boardId}`);
      if (stored) {
        const parsed: { id: string; timestamp: number }[] = JSON.parse(stored);
        const now = Date.now();
        const cooldownMs = (options?.cooldownHours ?? 24) * 60 * 60 * 1000;
        const valid = parsed.filter((item) => now - item.timestamp < cooldownMs).map((i) => i.id);
        return new Set(valid);
      }
    } catch {
      // Ignorar errores de localStorage en SSR o entornos restringidos
    }
    return new Set<string>();
  });

  const queryKey = ['proactive-advisory-observer', boardId];

  const query = useQuery({
    queryKey,
    enabled: !!boardId,
    staleTime: 10 * 60 * 1000, // 10 minutos stale time (0 polling)
    queryFn: async (): Promise<OperationalRecommendation[]> => {
      if (!boardId) return [];

      // 1. Cargar ítems de planeación semanal para el tablero
      const { data: planItemsData, error: planError } = await supabase
        .from('weekly_plan_items')
        .select('*')
        .eq('board_id', boardId);

      if (planError) {
        throw new Error(`Error cargando ítems de plan semanal: ${planError.message}`);
      }

      const weeklyPlanItems: WeeklyPlanItem[] = (planItemsData || []).map((item: Record<string, any>) => ({
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

      // 2. Cargar ejecuciones asociadas
      const planItemIds = weeklyPlanItems.map((i) => i.id);
      let executionRecords: ExecutionRecord[] = [];
      if (planItemIds.length > 0) {
        const { data: execData } = await supabase
          .from('weekly_plan_item_executions')
          .select('*')
          .in('weekly_plan_item_id', planItemIds);

        executionRecords = (execData || []).map((e: Record<string, any>) => ({
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

      // 3. Cargar actividades POA contractuales
      const { data: poaData } = await supabase
        .from('items')
        .select('id, key, title, group_id, custom_columns')
        .eq('board_id', boardId);

      const poaItems: POAItemContract[] = (poaData || []).map((item: Record<string, any>) => {
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
        .eq('board_id', boardId);

      const priorDecisions: DecisionRecord[] = (decisionData || []).map((d: Record<string, any>) => ({
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

      // 5. Evaluar discrepancias proactivas de forma determinista pura en memoria
      const advisoryResult = evaluateProactive3DDiscrepancies({
        boardId,
        poaItems,
        weeklyPlanItems,
        executionRecords,
        priorDecisions,
      });

      return advisoryResult.recommendations;
    },
  });

  const dismissAdvisory = useCallback(
    (recommendationId: string) => {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(recommendationId);
        if (typeof window !== 'undefined' && boardId) {
          try {
            const now = Date.now();
            const stored = localStorage.getItem(`${DISMISSED_STORAGE_KEY_PREFIX}${boardId}`);
            const currentList: { id: string; timestamp: number }[] = stored ? JSON.parse(stored) : [];
            currentList.push({ id: recommendationId, timestamp: now });
            localStorage.setItem(`${DISMISSED_STORAGE_KEY_PREFIX}${boardId}`, JSON.stringify(currentList));
          } catch {
            // Ignorar errores de almacenamiento
          }
        }
        return next;
      });
    },
    [boardId]
  );

  const activeAdvisories = useMemo(() => {
    const raw = query.data || [];
    return raw.filter((rec) => !dismissedIds.has(rec.recommendationId));
  }, [query.data, dismissedIds]);

  return {
    advisories: activeAdvisories,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refreshAdvisories: () => query.refetch(),
    dismissAdvisory,
    hasActiveAdvisories: activeAdvisories.length > 0,
  };
}
