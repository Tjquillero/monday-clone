
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function ensureManglares() {
    const boardIds = ['3ea0326f-6ff7-409f-848a-1f296e6e3cc8', '41bdd7d8-f199-45da-b781-5a00e5ccde05'];
    
    for (const boardId of boardIds) {
        const { data: boards } = await supabase.from('boards').select('name').eq('id', boardId);
        if (!boards || boards.length === 0) continue;
        const boardName = boards[0].name;

        // Check if Manglares exists on this board
        const { data: existing } = await supabase.from('groups').select('*').eq('board_id', boardId).ilike('title', 'MANGLARES');
        
        if (existing && existing.length > 0) {
            console.log(`Manglares already exists on board [${boardName}] (${boardId})`);
        } else {
            console.log(`Creating Manglares on board [${boardName}] (${boardId})`);
            const { data: groups } = await supabase.from('groups').select('id').eq('board_id', boardId);
            await supabase.from('groups').insert({
                board_id: boardId,
                title: 'MANGLARES',
                color: '#3b82f6',
                position: (groups?.length || 0) + 1
            });
        }
    }
}

ensureManglares();
