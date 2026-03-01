'use client';

import { useMemo } from 'react';
import GanttView from '@/components/GanttView';
import { useBoard, useBoardGroups, useBoardColumns, useTaskDependencies } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { isActivityItem } from '@/utils/itemUtils';

interface GanttViewContainerProps {
  searchQuery: string;
  selectedGroupId: string | null;
  filters: {
    status: string[];
    priority: string[];
    person: string[];
  };
  onOpenItem: (groupId: string, item: any) => void;
}

export default function GanttViewContainer({ searchQuery, selectedGroupId, filters, onOpenItem }: GanttViewContainerProps) {
  const { data: board } = useBoard();
  const { data: groups, isLoading } = useBoardGroups(board?.id);
  const { data: columns } = useBoardColumns(board?.id);
  const { data: taskDependencies } = useTaskDependencies(board?.id);
  const { addItem, updateItem, deleteItem } = useBoardMutations(board?.id);

  const activityGroups = useMemo(() => {
    if (!groups || !columns) return [];

    const statusColId = columns.find(c => c.type === 'status')?.id;
    const priorityColId = columns.find(c => c.type === 'priority')?.id;

    return groups
      .filter(g => !selectedGroupId || g.id === selectedGroupId)
      .map(g => ({
        ...g,
        items: g.items
          .filter(isActivityItem)
          .filter(item => {
            // 1. Busqueda por Texto
            const searchTerms = [
              item.name,
              item.description || '',
              ...Object.values(item.values || {}).map(v => String(v))
            ].join(' ').toLowerCase();
            const matchesSearch = searchTerms.includes(searchQuery.toLowerCase());

            // 2. Filtro de Estado
            const itemStatus = statusColId ? item.values[statusColId] : null;
            const matchesStatus = filters.status.length === 0 || (itemStatus && filters.status.includes(itemStatus));

            // 3. Filtro de Prioridad
            const itemPriority = priorityColId ? item.values[priorityColId] : null;
            const matchesPriority = filters.priority.length === 0 || (itemPriority && filters.priority.includes(itemPriority));

            // 4. Filtro por Persona
            const itemPersonId = item.personnel_id;
            const matchesPerson = filters.person.length === 0 || (itemPersonId && filters.person.includes(itemPersonId));

            return matchesSearch && matchesStatus && matchesPriority && matchesPerson;
          })
      }))
      .filter(g => g.items.length > 0 || (searchQuery === '' && filters.status.length === 0 && filters.priority.length === 0 && !selectedGroupId));
  }, [groups, columns, searchQuery, selectedGroupId, filters]);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Cargando cronograma...</div>;

  return (
    <GanttView 
      groups={activityGroups} 
      onOpenItem={onOpenItem} 
      onAddItem={(groupId, name) => addItem.mutate({ groupId, name, initialValues: {} })}
      onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
      onUpdateItemValue={(groupId, itemId, columnId, value) => updateItem.mutate({ itemId, updates: { [columnId]: value }, isValuesUpdate: true })}
      dependencies={taskDependencies || []}
    />
  );
}
