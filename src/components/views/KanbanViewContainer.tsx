'use client';

import { useState, useMemo } from 'react';
import { 
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DndContext,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import KanbanView from './KanbanView';
import { useBoard, useBoardColumns, useBoardGroups } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { isActivityItem } from '@/utils/itemUtils';
import { Item, Group, Column } from '@/types/monday';
import { createPortal } from 'react-dom';

interface KanbanViewContainerProps {
  searchQuery: string;
  selectedGroupId: string | null;
  filters: {
    status: string[];
    priority: string[];
    person: string[];
  };
  onOpenItem: (groupId: string, item: any) => void;
}

export default function KanbanViewContainer({ searchQuery, selectedGroupId, filters, onOpenItem }: KanbanViewContainerProps) {
  const { data: board, isLoading: boardLoading } = useBoard();
  const { data: columns, isLoading: columnsLoading } = useBoardColumns(board?.id);
  const { data: groups, isLoading: groupsLoading } = useBoardGroups(board?.id);
  const { updateItem } = useBoardMutations(board?.id);

  const [activeItem, setActiveItem] = useState<Item | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { 
        distance: 5 
      } 
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Identify status and priority columns
  const statusCol = useMemo(() => {
    return columns?.find(c => c.type === 'status');
  }, [columns]);

  const priorityColId = useMemo(() => {
    return columns?.find(c => c.type === 'priority')?.id;
  }, [columns]);

  const activityItems = useMemo(() => {
    if (!groups || !statusCol) return [];
    
    // 1. Filtrar grupos por Sitio (Ubicación)
    const filteredGroups = !selectedGroupId 
      ? groups 
      : groups.filter(g => String(g.id) === String(selectedGroupId));

    return filteredGroups.flatMap(g => g.items)
      .filter(isActivityItem)
      .filter(item => {
        // 2. Busqueda por Texto
        const searchTerms = [
          item.name,
          item.description || '',
          ...Object.values(item.values || {}).map(v => String(v))
        ].join(' ').toLowerCase();
        const matchesSearch = searchTerms.includes(searchQuery.toLowerCase());

        // 3. Filtro de Estado
        const itemStatus = item.values[statusCol.id];
        const matchesStatus = filters.status.length === 0 || (itemStatus && filters.status.includes(itemStatus));

        // 4. Filtro de Prioridad
        const itemPriority = priorityColId ? item.values[priorityColId] : null;
        const matchesPriority = filters.priority.length === 0 || (itemPriority && filters.priority.includes(itemPriority));

        // 5. Filtro por Persona
        const itemPersonId = item.personnel_id;
        const matchesPerson = filters.person.length === 0 || (itemPersonId && filters.person.includes(itemPersonId));

        return matchesSearch && matchesStatus && matchesPriority && matchesPerson;
      });
  }, [groups, statusCol, priorityColId, searchQuery, selectedGroupId, filters]);

  // Robustness Strategy: Defensive handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = activityItems.find(i => String(i.id) === String(active.id));
    if (item) setActiveItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over || !statusCol) return;

    const itemId = active.id;
    const newStatus = over.id as string; // Column ID is the status label

    // Find current status to avoid redundant updates
    const item = activityItems.find(i => String(i.id) === String(itemId));
    const currentStatus = item?.values[statusCol.id] || 'Not Started';

    if (newStatus !== currentStatus) {
      updateItem.mutate({ 
        itemId: String(itemId), 
        updates: { [statusCol.id]: newStatus }, 
        isValuesUpdate: true 
      });
    }
  };

  if (boardLoading || columnsLoading || groupsLoading) {
    return <div className="p-8 text-center text-gray-500">Cargando Kanban...</div>;
  }

  if (!statusCol) {
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-dashed border-gray-300">
        <p className="text-gray-500 font-medium">No se encontró una columna de estado para generar el Kanban.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <KanbanView 
          items={activityItems} 
          statusCol={statusCol}
          onOpenItem={onOpenItem}
        />
        
        {/* Drag Overlay for smooth visual feedback - Totally isolated */}
        {typeof document !== 'undefined' && createPortal(
          <DragOverlay dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
              styles: {
                active: {
                  opacity: '0.4',
                },
              },
            }),
          }}>
            {activeItem ? (
              <div className="w-72 p-4 bg-white rounded-xl shadow-2xl border-2 border-primary rotate-3 scale-105 pointer-events-none">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">Moviendo</span>
                </div>
                <p className="text-sm font-bold text-gray-900 line-clamp-2">{activeItem.name}</p>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  );
}
