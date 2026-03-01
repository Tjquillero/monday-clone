
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanAndCheck() {
    const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
    
    // 1. List all groups
    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', boardId);
    console.log('Current Groups:', groups.map(g => ({ id: g.id, title: g.title })));

    // 2. Identify Manglares groups with 0 items
    for (const group of groups || []) {
        if (group.title.toUpperCase().includes('MANGLARES')) {
            const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', group.id);
            console.log(`Group ${group.title} (${group.id}) has ${count} items.`);
            
            if (count === 0) {
                console.log(`Deleting empty group: ${group.id}`);
                await supabase.from('groups').delete().eq('id', group.id);
            }
        }
    }

    // 3. Final Check
    const { data: finalGroups } = await supabase.from('groups').select('*').eq('board_id', boardId);
    console.log('Final Groups:', finalGroups.map(g => g.title));
}

cleanAndCheck();
