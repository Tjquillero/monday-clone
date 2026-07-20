'use client';

import { useMemo } from 'react';
import { Group } from '@/types/monday';
import { useWeeklyPlan } from '@/hooks/useWeeklyPlan';
import { useBoardWeeklyPlans } from '@/hooks/useBoardWeeklyPlans';
import { useSiteWage } from '@/hooks/useSiteWage';
import { getMonday, getBogotaToday } from '@/lib/weeklyPlanner';
import CostosOperativosView from '@/components/costos/CostosOperativosView';

// Dashboard de Costos Operativos — reusa exactamente la misma fuente que el
// Cronograma (useWeeklyPlan → WeeklyPlanningContext.activities) y el mismo
// origen de salario que ya usaba ResourceEfficiencyWidget
// (resource_analysis.wages_data, vía useSiteWage). Sin fórmula propia.
// Semana fija a la actual en esta Fase 1 — sin navegación de semanas todavía.
//
// Fase 3 (indicadores ejecutivos, alcance JR): useBoardWeeklyPlans agrega
// las 12 zonas del board a la vez, para el ranking de sitios y el Pareto de
// actividades — ver docs/adr, redefinido a JR porque ningún sitio real
// tiene costo de jornal configurado todavía.

interface Props {
  boardId: string | undefined;
  selectedGroupId: string | null;
  groups: Group[] | undefined;
  onSelectGroup: (groupId: string) => void;
}

export default function CostosOperativosContainer({ boardId, selectedGroupId, groups, onSelectGroup }: Props) {
  const weekStart = useMemo(() => getMonday(getBogotaToday()), []);

  const group = useMemo(() => {
    if (!selectedGroupId || !groups) return undefined;
    const g = groups.find((g) => g.id === selectedGroupId);
    return g ? { id: g.id, title: g.title } : undefined;
  }, [selectedGroupId, groups]);

  const boardGroups = useMemo(
    () => (groups ?? []).map((g) => ({ id: g.id, title: g.title })),
    [groups],
  );

  const { plan, isLoading: planLoading, isError: planError, error } = useWeeklyPlan(boardId, group, weekStart);
  const { data: costoJornal, isLoading: wageLoading } = useSiteWage(boardId, group?.id);
  const { sites: boardSites, isLoading: boardSitesLoading } = useBoardWeeklyPlans(boardId, boardGroups, weekStart);

  return (
    <CostosOperativosView
      boardId={boardId}
      group={group}
      plan={plan}
      costoJornal={costoJornal ?? 0}
      isLoading={planLoading || wageLoading}
      isError={planError}
      error={error}
      boardSites={boardSites}
      boardSitesLoading={boardSitesLoading}
      onSelectGroup={onSelectGroup}
    />
  );
}
