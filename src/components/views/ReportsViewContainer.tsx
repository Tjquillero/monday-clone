'use client';

import { useMemo } from 'react';
import ReportsView from '@/components/ReportsView';
import { useBoard, useBoardGroups, useBoardColumns } from '@/hooks/useBoardData';
import { isActivityItem } from '@/utils/itemUtils';

export default function ReportsViewContainer() {
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


  if (groupsLoading || columnsLoading) return <div className="p-8 text-center text-gray-500">Generando reportes...</div>;

  const projectName = board?.name === 'Tablero Principal' || !board?.name
    ? "Contrato: 038 - 2023<br/><br/>CONSERVACIÓN INTEGRAL Y REVITALIZACIÓN DE LOS PROYECTOS DE INFRAESTRUCTURA TURÍSTICA DEL DEPARTAMENTO DEL ATLÁNTICO, ASÍ COMO SUS ACTIVIDADES RELACIONADAS Y/O CONEXAS."
    : board.name;

  return <ReportsView groups={activityGroups} columns={columns || []} boardName={projectName} boardId={board?.id} />;
}
