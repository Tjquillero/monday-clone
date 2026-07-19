'use client';

import { useMemo } from 'react';
import { Group } from '@/types/monday';
import { useWeeklyPlan } from '@/hooks/useWeeklyPlan';
import { useSiteWage } from '@/hooks/useSiteWage';
import { getMonday } from '@/lib/weeklyPlanner';
import CostosOperativosView from '@/components/costos/CostosOperativosView';

// Dashboard de Costos Operativos — reusa exactamente la misma fuente que el
// Cronograma (useWeeklyPlan → WeeklyPlanningContext.activities) y el mismo
// origen de salario que ya usaba ResourceEfficiencyWidget
// (resource_analysis.wages_data, vía useSiteWage). Sin fórmula propia.
// Semana fija a la actual en esta Fase 1 — sin navegación de semanas todavía.

interface Props {
  boardId: string | undefined;
  selectedGroupId: string | null;
  groups: Group[] | undefined;
}

export default function CostosOperativosContainer({ boardId, selectedGroupId, groups }: Props) {
  const weekStart = useMemo(() => getMonday(new Date()), []);

  const group = useMemo(() => {
    if (!selectedGroupId || !groups) return undefined;
    const g = groups.find((g) => g.id === selectedGroupId);
    return g ? { id: g.id, title: g.title } : undefined;
  }, [selectedGroupId, groups]);

  const { plan, isLoading: planLoading, isError: planError, error } = useWeeklyPlan(boardId, group, weekStart);
  const { data: costoJornal, isLoading: wageLoading } = useSiteWage(boardId, group?.id);

  return (
    <CostosOperativosView
      boardId={boardId}
      group={group}
      plan={plan}
      costoJornal={costoJornal ?? 0}
      isLoading={planLoading || wageLoading}
      isError={planError}
      error={error}
    />
  );
}
