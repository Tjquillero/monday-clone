
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import budgetData from '@/data/budget_seed.json'; 
import { useQueryClient } from '@tanstack/react-query';

interface BudgetSeederProps {
    boardId: string;
}

export default function BudgetSeeder({ boardId }: BudgetSeederProps) {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (boardId) {
            checkAndSeed();
        }
    }, [boardId]);

    const checkAndSeed = async () => {
        try {
            // 1. Get or Create Group
            let targetGroupId = '';
            const { data: existingGroups } = await supabase
                .from('groups')
                .select('id, title')
                .eq('board_id', boardId);

            const budgetGroup = existingGroups?.find(g => g.title === 'PRESUPUESTO GENERAL');

            if (budgetGroup) {
                targetGroupId = budgetGroup.id;
                // Check if this group already has items
                const { data: items } = await supabase
                    .from('items')
                    .select('id')
                    .eq('group_id', targetGroupId)
                    .limit(1);
                
                if (items && items.length > 0) {
                    console.log('Budget data already seeded.');
                    return;
                }
            } else {
                console.log('Creating Budget group...');
                const { data: newGroup, error: groupError } = await supabase
                    .from('groups')
                    .insert({
                        board_id: boardId,
                        title: 'PRESUPUESTO GENERAL',
                        color: '#579bfc',
                        position: 0
                    })
                    .select()
                    .single();
                if (groupError) throw groupError;
                targetGroupId = newGroup.id;
            }

            console.log('Seeding budget data...');
            // 2. Insert Items in chunks
                const chunkSize = 50;
                const itemsToInsert = budgetData.map((item: any, index: number) => ({
                    name: item.name,
                    group_id: targetGroupId,
                    position: index,
                    values: {
                        unit: item.unit,
                        cant: item.cant,
                        unit_price: item.unit_price,
                        budget: item.cant * item.unit_price,
                        item_type: 'financial'
                    }
                }));

                for (let i = 0; i < itemsToInsert.length; i += chunkSize) {
                    const chunk = itemsToInsert.slice(i, i + chunkSize);
                    const { error } = await supabase.from('items').insert(chunk);
                    if (error) {
                        console.error('Error inserting chunk:', error);
                        throw error;
                    }
                }

                console.log('Seeding completed successfully.');
                
                // Invalidate queries to refresh UI without reload
                queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
                queryClient.invalidateQueries({ queryKey: ['items', boardId] });
            } catch (error) {
            console.error('Seeding error:', error);
        }
    };

    return null; // Silent component
}

