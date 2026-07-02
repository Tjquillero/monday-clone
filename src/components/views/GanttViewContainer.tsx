'use client';

// ============================================================================
// LEGACY — eliminado de la navegación el 2026-07-01 (era la pestaña "Ops").
// NO volver a conectar a la navegación. Pendiente decidir si se consolida
// con el Cronograma (planner) o se elimina. Ver src/config/navigation.ts.
// ============================================================================

import { useMemo } from 'react';
import TacticalOperationsView from '@/components/TacticalOperationsView';
import { useBoard, useBoardGroups, useBoardColumns, useTaskDependencies } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { isActivityItem } from '@/utils/itemUtils';
import { getColumnValueKey } from '@/utils/columnUtils';

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
  const { addItem, updateItem, deleteItem } = useBoardMutations(board?.id);

  // Filter logic remains the same
  const activityGroups = useMemo(() => {
    if (!groups || !columns) return [];
    const statusCol = columns.find(c => c.type === 'status');
    const priorityCol = columns.find(c => c.type === 'priority');
    const statusColId = statusCol ? getColumnValueKey(statusCol) : undefined;
    const priorityColId = priorityCol ? getColumnValueKey(priorityCol) : undefined;

    return groups
      .filter(g => !selectedGroupId || g.id === selectedGroupId)
      .map(g => ({
        ...g,
        items: g.items
          .filter(isActivityItem)
          .filter(item => {
            const searchTerms = [
              item.name,
              item.description || '',
              ...Object.values(item.values || {}).map(v => String(v))
            ].join(' ').toLowerCase();
            const matchesSearch = searchTerms.includes(searchQuery.toLowerCase());
            const itemStatus = statusColId ? item.values[statusColId] : null;
            const matchesStatus = filters.status.length === 0 || (itemStatus && filters.status.includes(itemStatus));
            const itemPriority = priorityColId ? item.values[priorityColId] : null;
            const matchesPriority = filters.priority.length === 0 || (itemPriority && filters.priority.includes(itemPriority));
            const itemPersonId = item.personnel_id;
            const matchesPerson = filters.person.length === 0 || (itemPersonId && filters.person.includes(itemPersonId));
            return matchesSearch && matchesStatus && matchesPriority && matchesPerson;
          })
      }))
      .filter(g => g.items.length > 0 || (searchQuery === '' && filters.status.length === 0 && filters.priority.length === 0 && !selectedGroupId));
  }, [groups, columns, searchQuery, selectedGroupId, filters]);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-10 h-10 border-4 border-[#3B7EF8] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(59,126,248,0.3)]" />
        <p className="text-[10px] font-black text-[#3B7EF8] uppercase tracking-[0.2em] animate-pulse">Sincronizando Inteligencia Operativa...</p>
    </div>
  );

  return (
    <div className="h-full min-h-0 bg-[var(--bg-primary)]">
      <TacticalOperationsView 
        groups={activityGroups} 
        columns={columns || []}
        onOpenItem={onOpenItem}
        onUpdateItemValue={(groupId, itemId, columnId, value) => updateItem.mutate({ itemId, updates: { [columnId]: value }, isValuesUpdate: true })}
      />
    </div>
  );
}
