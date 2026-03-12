'use client';

import { useMemo } from 'react';
import CentralizedFinancialDashboard from '@/components/dashboard/CentralizedFinancialDashboard';
import ResourceEfficiencyWidget from '@/components/dashboard/ResourceEfficiencyWidget';
import { useBoard, useBoardColumns, useBoardGroups, useActivityTemplates } from '@/hooks/useBoardData';
import { useBoardMutations } from '@/hooks/useBoardMutations';
import { isFinancialItem, isActivityItem } from '@/utils/itemUtils';
import { Calculator } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';

export default function FinancialViewContainer() {
  const queryClient = useQueryClient();
  const { data: board, isLoading: boardLoading } = useBoard();
  const { data: groups, isLoading: groupsLoading } = useBoardGroups(board?.id);
  const { data: columns } = useBoardColumns(board?.id);
  const { data: activityTemplates } = useActivityTemplates();
  const { updateItem, addItem, deleteItem } = useBoardMutations(board?.id);

  const financialGroups = useMemo(() => {
    if (!groups) return [];
    return groups.map(g => ({
      ...g,
      items: g.items.filter(isFinancialItem)
    }));
  }, [groups]);

  const activityGroupsForWidget = useMemo(() => {
    if (!groups) return [];
    return groups.map(g => ({
      ...g,
      items: g.items.filter(isActivityItem)
    })).filter(g => g.items.length > 0);
  }, [groups]);

  // Settings from board
  const settings = board?.settings || {};
  const totalActa = settings.totalActa || 0;
  const valorActaPorSitio = settings.valorActaPorSitio || {};

  const handleUpdateBoardSettings = async (newSettings: any) => {
    if (!board?.id) return;
    const { data: currentBoard } = await supabase.from('boards').select('settings').eq('id', board.id).single();
    const updatedSettings = { ...(currentBoard?.settings || {}), ...newSettings };
    await supabase.from('boards').update({ settings: updatedSettings }).eq('id', board.id);
    queryClient.invalidateQueries({ queryKey: ['board'] });
  };

  if (boardLoading || groupsLoading) return <div className="p-8 text-center text-gray-500">Cargando datos financieros...</div>;

  return (
    <div className="w-full py-6 px-4">
      <CentralizedFinancialDashboard 
        groups={financialGroups} 
        columns={columns || []} 
        onUpdateItemValue={async (groupId: string, itemId: string | number, columnId: string, value: any) => {
            // Map common financial fields to the internal storage or specific columns
            let updates: any = { [columnId]: value };
            let isValuesUpdate = true;

            // If it's one of our mapped financial items, they store data in 'values'
            updateItem.mutate({ itemId, updates, isValuesUpdate });
        }}
        onAddItem={async (major: string, sub: string, subSub?: string) => {
            const targetGroupId = groups?.[0]?.id;
            if (!targetGroupId) return;
            // Ask for name to avoid generic "Nuevo Recurso"
            const name = window.prompt(`Nombre del nuevo recurso para ${subSub || sub}:`, 'Nuevo Recurso');
            if (!name) return;
            
            addItem.mutate({ 
                groupId: targetGroupId, 
                name: name, 
                initialValues: { 
                    rubro: major, 
                    category: sub, 
                    sub_category: subSub || 'General', 
                    item_type: 'financial', 
                    unit: 'Und', 
                    unit_price: 0, 
                    cant: 0 
                } 
            });
        }}
        onDeleteItem={(itemId: string | number) => deleteItem.mutate(itemId)}
        onDeleteItems={async (itemIds: (string | number)[]) => {
            // Simplified: loop or specialized mutation
            for (const id of itemIds) {
                deleteItem.mutate(id);
            }
        }}
        onRenameGroup={async (oldName: string, newName: string, type: 'major' | 'sub' | 'subsub', context?: { major?: string, sub?: string }) => {
            let colId = 'rubro';
            if (type === 'sub') colId = 'category';
            if (type === 'subsub') colId = 'sub_category';
            
            const itemsToUpdate = groups?.flatMap(g => g.items).filter(i => {
                const matchName = (i.values[colId] || (colId === 'sub_category' ? 'General' : '')) === oldName;
                if (!matchName) return false;
                
                // Context Check
                if (type === 'sub' && context?.major) {
                    return (i.values.rubro || '') === context.major;
                }
                if (type === 'subsub' && context?.major && context?.sub) {
                    return (i.values.rubro || '') === context.major && (i.values.category || '') === context.sub;
                }
                return true;
            }) || [];
            
            for (const item of itemsToUpdate) {
                updateItem.mutate({ itemId: item.id, updates: { [colId]: newName }, isValuesUpdate: true });
            }
        }}
        onAddGroup={async (type: 'major' | 'sub' | 'subsub', parentContext?: { major?: string, sub?: string }) => {
            const typeLabel = type === 'major' ? 'Categoría (Rubro)' : type === 'sub' ? 'Subcategoría' : 'Grupo (Sub-Subcategoría)';
            const name = window.prompt(`Nombre para la nueva ${typeLabel}:`);
            if (!name) return;
            
            const targetGroupId = groups?.[0]?.id;
            if (!targetGroupId) return;
            
            addItem.mutate({
                groupId: targetGroupId,
                name: 'Primer Recurso',
                initialValues: { 
                    rubro: type === 'major' ? name.toUpperCase() : (parentContext?.major || 'GENERAL'),
                    category: type === 'sub' ? name : (parentContext?.sub || 'General'),
                    sub_category: type === 'subsub' ? name : 'General',
                    item_type: 'financial',
                    cant: 0,
                    unit_price: 0
                }
            });
        }}
        onAddSite={async () => {
             const rawSiteName = prompt('Nombre del nuevo sitio / proyecto:');
             if (!rawSiteName || !board?.id) return;
             
             const siteName = rawSiteName.trim().toUpperCase();
             
             // Validar duplicidad
             const exists = groups?.some(g => g.title.trim().toUpperCase() === siteName);
             if (exists) {
                 alert(`Error: Ya existe un sitio llamado "${siteName}".`);
                 return;
             }

             // 1. Create the new group
             const { data: newGroup, error: groupError } = await supabase.from('groups').insert({ 
                 board_id: board.id, 
                 title: siteName, 
                 color: '#3b82f6', 
                 position: groups?.length || 0 
             }).select().single();

             if (groupError) {
                 alert(`Error al crear sitio: ${groupError.message}`);
                 return;
             }

             // 2. Initialize with rubros from first site (Plaza Puerto Colombia or similar)
             // This solves the visibility problem permanently
             const referenceGroup = groups?.find(g => g.items.some(isFinancialItem));
             
             if (referenceGroup && newGroup) {
                 // Copy unique rubros (items) to the new site
                 const itemsToCopy = referenceGroup.items.filter(isFinancialItem);
                 
                 if (itemsToCopy.length > 0) {
                     const copies = itemsToCopy.map(i => ({
                         board_id: board.id,
                         group_id: newGroup.id,
                         name: i.name,
                         position: i.position,
                         values: {
                             ...i.values,
                             item_type: 'financial',
                             cant: 0,           // Initialize quantities to 0
                             executed_qty: 0,
                             unit_price: i.values.unit_price || 0 // Keep the estimated price
                         }
                     }));

                     const { error: copyError } = await supabase.from('items').insert(copies);
                     if (copyError) {
                         console.error('Error initializing site items:', copyError);
                     }
                 }
             } else if (newGroup) {
                // If no reference exists, create at least one dummy item to ensure visibility
                await supabase.from('items').insert({
                    board_id: board.id,
                    group_id: newGroup.id,
                    name: 'INICIO DE PROYECTO',
                    values: { rubro: 'INICIO', category: 'GENERAL', item_type: 'financial', cant: 0, unit_price: 0 },
                    position: 0
                });
             }

             await queryClient.invalidateQueries({ queryKey: ['groups', board.id] });
             await queryClient.invalidateQueries({ queryKey: ['board'] }); // Refresh for settings
        }}
        totalActa={totalActa}
        onUpdateActa={(val) => handleUpdateBoardSettings({ totalActa: val })}
        valorActaPorSitio={valorActaPorSitio}
        onUpdateValorActaPorSitio={(val) => handleUpdateBoardSettings({ valorActaPorSitio: val })}
        boardId={board?.id}
        activityGroups={activityGroupsForWidget}
        activityTemplates={activityTemplates || []}
      />

    </div>
  );
}
