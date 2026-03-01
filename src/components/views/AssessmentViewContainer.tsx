'use client';

import { useMemo } from 'react';
import AssessmentView from '@/components/AssessmentView';
import { useBoard, useBoardGroups } from '@/hooks/useBoardData';
import { isActivityItem } from '@/utils/itemUtils';

export default function AssessmentViewContainer() {
  const { data: board } = useBoard();
  const { data: groups, isLoading } = useBoardGroups(board?.id);

  const activityGroups = useMemo(() => {
    if (!groups) return [];
    return groups
      .filter(g => g.title.toUpperCase() !== 'PRESUPUESTO GENERAL')
      .map(g => ({
      ...g,
      items: g.items.filter(isActivityItem)
    })).filter(g => g.items.length > 0);
  }, [groups]);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Calculando indicadores...</div>;

  return <AssessmentView groups={activityGroups} />;
}
