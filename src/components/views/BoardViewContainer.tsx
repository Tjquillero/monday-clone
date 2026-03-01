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
import { useBoard, useBoardColumns, useBoardGroups, useActivityTemplates, useTaskDependencies } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { useAuth } from '@/contexts/AuthContext';
import { isActivityItem } from '@/utils/itemUtils';
import { Group, Item } from '@/types/monday';
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
  onOpenItem: (groupId: string, item: any) => void;
}

export default function BoardViewContainer({ searchQuery, selectedGroupId, filters, onOpenItem }: BoardViewContainerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = (user?.user_metadata as any)?.role === 'admin' || user?.email === 'admin@mantenix.com';

  const { data: board, isLoading: boardLoading } = useBoard();
  const { data: columns } = useBoardColumns(board?.id);
  const { data: groups } = useBoardGroups(board?.id);
  const { data: activityTemplates } = useActivityTemplates();
  const { data: dependencies } = useTaskDependencies(board?.id);

  const { addItem, updateItem, deleteItem } = useBoardMutations(board?.id);

  const [activeId, setActiveId] = useState<string | number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activityGroups = useMemo(() => {
    if (!groups || !columns) return [];
    
    // Identificar columnas de estado y prioridad
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

  // Handlers
  const handleAddItem = (groupId: string, name: string, template?: any) => {
    const initialValues: any = { ...template };
    columns?.forEach(col => {
      if (col.type === 'status') initialValues[col.id] = 'Not Started';
      else if (col.type === 'priority') initialValues[col.id] = 'Low';
      else if (!initialValues[col.id]) initialValues[col.id] = '';
    });
    addItem.mutate({ groupId, name, initialValues });
  };

  const handleUpdateItemValue = (groupId: string, itemId: string | number, columnId: string, value: any) => {
    updateItem.mutate({ itemId, updates: { [columnId]: value }, isValuesUpdate: true });
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <BoardView 
        groups={activityGroups} 
        columns={columns?.filter(c => !['people', 'unit_price', 'cant', 'category', 'rubro'].includes(c.id)) || []}
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
        onAddSubItem={async (groupId, parentId) => {
           await supabase.from('items').insert({
             group_id: groupId,
             parent_id: parentId,
             name: 'Nuevo sub-ítem',
             values: { unit: 'M2', cant: 0 },
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
        onUpdateGroup={async (groupId, field, value) => {
           await supabase.from('groups').update({ [field]: value }).eq('id', groupId);
           queryClient.invalidateQueries({ queryKey: ['groups', board?.id] });
        }}
        onAddColumn={async (type) => {
           // Basic logic for adding column
           await supabase.from('board_columns').insert({
             board_id: board?.id,
             title: 'Nueva Columna',
             type,
             width: 150,
             position: columns?.length || 0
           });
           queryClient.invalidateQueries({ queryKey: ['columns', board?.id] });
        }}
      />
    </DndContext>
  );
}
