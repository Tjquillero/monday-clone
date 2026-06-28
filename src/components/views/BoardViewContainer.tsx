'use client';

import { useState, useMemo } from 'react';
import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DndContext,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import BoardView from '@/components/BoardView';
import { ViewBar } from '@/components/views/ViewBar';
import { useBoard, useBoardColumns, useBoardGroups, useActivityTemplates, useTaskDependencies } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { useColumnMutations } from '@/hooks/useColumnMutations';
import { useBoardView } from '@/hooks/useBoardView';
import { useBoardViews } from '@/hooks/useBoardViews';
import { useAuth } from '@/contexts/AuthContext';
import { isActivityItem } from '@/utils/itemUtils';
import { getColumnValueKey, getDefaultLabelId } from '@/utils/columnUtils';
import { Column, ColumnType, Group, Item } from '@/types/monday';
import { SortRule } from '@/types/views';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';

interface BoardViewContainerProps {
  searchQuery: string;
  selectedGroupId: string | null;
  filters: {
    status: string[];
    priority: string[];
    person: string[];
  };
  onOpenItem: (groupId: string, item: any, tab?: any) => void;
}

export default function BoardViewContainer({ searchQuery, selectedGroupId, filters, onOpenItem }: BoardViewContainerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = (user?.user_metadata as any)?.role?.toLowerCase();
  const isAdmin = role === 'admin' || user?.email === 'admin@mantenix.com';

  const { data: board, isLoading: boardLoading } = useBoard();
  const { data: columns } = useBoardColumns(board?.id);
  const { data: groups } = useBoardGroups(board?.id);
  const { data: activityTemplates } = useActivityTemplates();
  const { data: dependencies } = useTaskDependencies(board?.id);

  const { addItem, updateItem, deleteItem } = useBoardMutations(board?.id);
  const { createColumn, updateColumn, deleteColumn } = useColumnMutations(board?.id);
  const { views: savedViews, saveView, deleteView } = useBoardViews(board?.id);

  const [activeId, setActiveId] = useState<string | number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Pre-filter: search text + sidebar filters + exclude budget groups/non-activity items
  const baseGroups = useMemo(() => {
    if (!groups || !columns) return [];
    const statusCol = columns.find(c => c.type === 'status');
    const priorityCol = columns.find(c => c.type === 'priority');
    const statusKey = statusCol ? getColumnValueKey(statusCol) : null;
    const priorityKey = priorityCol ? getColumnValueKey(priorityCol) : null;

    return groups
      .filter(g => !g.title.toUpperCase().includes('PRESUPUESTO'))
      .filter(g => !selectedGroupId || g.id === selectedGroupId)
      .map(g => ({
        ...g,
        items: g.items
          .filter(isActivityItem)
          .filter(item => {
            const searchTerms = [item.name, item.description || '', ...Object.values(item.values || {}).map(v => String(v))].join(' ').toLowerCase();
            const matchesSearch = searchTerms.includes(searchQuery.toLowerCase());
            const itemStatus = statusKey ? item.values[statusKey] : null;
            const matchesStatus = filters.status.length === 0 || (itemStatus && filters.status.includes(itemStatus));
            const itemPriority = priorityKey ? item.values[priorityKey] : null;
            const matchesPriority = filters.priority.length === 0 || (itemPriority && filters.priority.includes(itemPriority));
            const matchesPerson = filters.person.length === 0 || (item.personnel_id && filters.person.includes(item.personnel_id));
            return matchesSearch && matchesStatus && matchesPriority && matchesPerson;
          }),
      }))
      .filter(g => g.items.length > 0 || (searchQuery === '' && filters.status.length === 0 && filters.priority.length === 0 && !selectedGroupId));
  }, [groups, columns, searchQuery, selectedGroupId, filters]);

  // View engine: filter + sort from useBoardView on top of baseGroups
  const {
    activeView, isDirty, filteredGroups: activityGroups, visibleColumns: viewColumns,
    addFilter, updateFilter, removeFilter, clearFilters,
    addSort, removeSort, toggleColumn, loadView, markSaved, reset,
  } = useBoardView(baseGroups, columns?.filter(c => !['unit_price', 'cant', 'category', 'rubro'].includes(c.id)));

  const handleToggleSortDir = (id: string) => {
    const rule = activeView.sorts.find(s => s.id === id);
    if (rule) addSort({ ...rule, direction: rule.direction === 'asc' ? 'desc' : 'asc' } as SortRule);
  };

  // Handlers
  const handleAddItem = (groupId: string, name: string, template?: any) => {
    const initialValues: any = { ...template, item_type: 'activity' };
    columns?.forEach(col => {
      const key = getColumnValueKey(col);
      const defaultVal = getDefaultLabelId(col);
      if (defaultVal) initialValues[key] = defaultVal;
      else if (!initialValues[key]) initialValues[key] = '';
    });
    addItem.mutate({ groupId, name, initialValues });
  };

  const handleUpdateItemValue = (groupId: string, itemId: string | number, columnKey: string, value: any) => {
    updateItem.mutate({ itemId, updates: { [columnKey]: value }, isValuesUpdate: true });
  };

  const handleUpdateColumn = (columnId: string, updates: Partial<Column>) => {
    updateColumn.mutate({ columnId, updates });
  };

  const handleDeleteColumn = (columnId: string) => {
    deleteColumn.mutate(columnId);
  };

  const handleAddColumn = (type: ColumnType) => {
    createColumn.mutate(type);
  };

  const handleSaveView = async (name: string) => {
    const saved = await saveView.mutateAsync({
      ...activeView,
      name,
      boardId: board!.id,
    });
    if (saved) markSaved(saved.id);
  };

  const handleDeleteItem = (itemId: string | number) => {
    deleteItem.mutate(itemId);
  };

  // Drag and Drop
  const findContainer = (id: string | number) => {
    if (groups?.some(g => g.id === id)) return id;
    const group = groups?.find(g => g.items.some(item => item.id === id));
    return group ? group.id : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    // This is a bit tricky with React Query because we want to update the cache optimistically
    // For now, let's keep it simple and just do it in the next re-render or let mutations handle it
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    if (activeContainer && overContainer && activeId !== overId) {
      // Logic for moving items between groups or within groups
      // Similar to page.tsx, we update group_id in DB
      await supabase.from('items').update({ group_id: overContainer }).eq('id', activeId);
      queryClient.invalidateQueries({ queryKey: ['groups', board?.id] });
    }
    setActiveId(null);
  };

  if (boardLoading) return <div className="p-8 text-center text-gray-500">Cargando tablero...</div>;

  const allDisplayColumns = columns?.filter(c => !['unit_price', 'cant', 'category', 'rubro'].includes(c.id)) ?? [];

  return (
    <>
      <ViewBar
        columns={allDisplayColumns}
        savedViews={savedViews}
        activeView={activeView}
        isDirty={isDirty}
        onLoadView={loadView}
        onAddFilter={addFilter}
        onUpdateFilter={updateFilter}
        onRemoveFilter={removeFilter}
        onClearFilters={() => { clearFilters(); reset(); }}
        onAddSort={addSort}
        onRemoveSort={removeSort}
        onToggleSortDir={handleToggleSortDir}
        onToggleColumn={toggleColumn}
        onSaveView={handleSaveView}
        onDeleteView={(id) => deleteView.mutate(id)}
        onReset={reset}
      />
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <BoardView
        groups={activityGroups}
        columns={viewColumns}
        activityTemplates={activityTemplates || []}
        isAdmin={isAdmin}
        onCreateTemplate={async (template) => {
           const { data } = await supabase.from('activity_templates').insert(template).select().single();
           queryClient.invalidateQueries({ queryKey: ['activity_templates'] });
           return data;
        }}
        onAddItem={handleAddItem}
        onUpdateItem={(groupId, itemId, field, value) => updateItem.mutate({ itemId, updates: { [field]: value }, isValuesUpdate: false })}
        onUpdateItemValue={handleUpdateItemValue}
        onUpdateItemValues={(groupId, itemId, updates) => updateItem.mutate({ itemId, updates, isValuesUpdate: true })}
        onOpenItem={onOpenItem}
        onUpdateColumn={handleUpdateColumn}
        onDeleteColumn={handleDeleteColumn}
        onAddColumn={handleAddColumn}
        onAddSubItem={async (groupId, parentId) => {
           await supabase.from('items').insert({
             group_id: groupId,
             parent_id: parentId,
             name: 'Nuevo sub-ítem',
             values: { unit: 'M2', cant: 0, item_type: 'activity' },
             position: 0
           });
           queryClient.invalidateQueries({ queryKey: ['groups', board?.id] });
        }}
        onUpdateSubItemValue={(groupId, parentId, subItemId, columnId, value) => handleUpdateItemValue(groupId, subItemId, columnId, value)}
        onDeleteItem={handleDeleteItem}
        onAddGroup={async () => {
           await supabase.from('groups').insert({ board_id: board?.id, title: 'Nuevo Grupo', color: '#c4c4c4' });
           queryClient.invalidateQueries({ queryKey: ['groups', board?.id] });
        }}
        onUpdateGroup={async (groupId, updates) => {
           await supabase.from('groups').update(updates).eq('id', groupId);
           queryClient.invalidateQueries({ queryKey: ['groups', board?.id] });
        }}
      />
    </DndContext>
    </>
  );
}
