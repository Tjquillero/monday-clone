'use client';

import { useMemo } from 'react';
import ExecutionView from '@/components/ExecutionView';
import { useBoard, useBoardColumns, useBoardGroups, useActivityTemplates } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { useAuth } from '@/contexts/AuthContext';
import { isActivityItem } from '@/utils/itemUtils';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';

interface ExecutionViewContainerProps {
  searchQuery: string;
  selectedGroupId: string | null;
  filters: {
    status: string[];
    priority: string[];
    person: string[];
  };
  onOpenItem: (groupId: string, item: any) => void;
}

export default function ExecutionViewContainer({ searchQuery, selectedGroupId, filters, onOpenItem }: ExecutionViewContainerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = (user?.user_metadata as any)?.role === 'admin' || user?.email === 'admin@mantenix.com';

  const { data: board } = useBoard();
  const { data: groups, isLoading } = useBoardGroups(board?.id);
  const { data: columns } = useBoardColumns(board?.id);
  const { data: activityTemplates } = useActivityTemplates();

  const { addItem, updateItem, deleteItem } = useBoardMutations(board?.id);

  const activityGroups = useMemo(() => {
    if (!groups || !columns) return [];

    const statusColId = columns.find(c => c.type === 'status')?.id;
    const priorityColId = columns.find(c => c.type === 'priority')?.id;

    return groups
      .filter(g => g.title.toUpperCase() !== 'PRESUPUESTO GENERAL')
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

  if (isLoading) return <div className="p-8 text-center text-gray-500">Cargando ejecución...</div>;

  return (
    <ExecutionView 
      groups={activityGroups} 
      columns={columns?.filter(c => !['people', 'unit_price', 'cant', 'category', 'rubro'].includes(c.id)) || []}
      activityTemplates={activityTemplates || []}
      isAdmin={isAdmin}
      onCreateTemplate={async (template) => {
        const { data } = await supabase.from('activity_templates').insert(template).select().single();
        queryClient.invalidateQueries({ queryKey: ['activity_templates'] });
        return data;
      }}
      onOpenItem={onOpenItem} 
      onAddItem={(groupId, name, template) => addItem.mutate({ groupId, name, initialValues: template })}
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
      onDeleteItem={(itemId) => deleteItem.mutate(itemId)}
      onDeleteItems={async (itemIds) => {
        await supabase.from('items').delete().in('id', itemIds);
        queryClient.invalidateQueries({ queryKey: ['groups', board?.id] });
      }}
      onUpdateItemValue={(groupId, itemId, columnId, value) => updateItem.mutate({ itemId, updates: { [columnId]: value }, isValuesUpdate: true })}
      onUpdateItem={(groupId, itemId, field, value) => updateItem.mutate({ itemId, updates: { [field]: value }, isValuesUpdate: false })}
      onUpdateItemValues={(groupId, itemId, updates) => updateItem.mutate({ itemId, updates, isValuesUpdate: true })}
      userRole={(user?.user_metadata as any)?.role}
    />
  );
}
