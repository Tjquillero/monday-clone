'use client';

import { useMemo } from 'react';
import ChartView from '@/components/ChartView';
import { useBoard, useBoardGroups, useBoardColumns } from '@/hooks/useBoardData';
import { isActivityItem } from '@/utils/itemUtils';

export default function ChartViewContainer() {
  const { data: board } = useBoard();
  const { data: groups, isLoading: groupsLoading } = useBoardGroups(board?.id);
  const { data: columns, isLoading: columnsLoading } = useBoardColumns(board?.id);

  const activityGroups = useMemo(() => {
    if (!groups) return [];
    return groups
      .filter(g => g.title.toUpperCase() !== 'PRESUPUESTO GENERAL')
      .map(g => ({
      ...g,
      items: g.items.filter(isActivityItem)
    })).filter(g => g.items.length > 0);
  }, [groups]);

  if (groupsLoading || columnsLoading) return <div className="p-8 text-center text-gray-500">Cargando gráficos...</div>;

  return <ChartView groups={activityGroups} columns={columns || []} />;
}
