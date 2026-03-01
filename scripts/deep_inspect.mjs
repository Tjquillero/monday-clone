
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspectBoard() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log('Boards:', boards);
    if (!boards || boards.length === 0) return;

    for (const board of boards) {
        console.log(`\n--- Board: ${board.name} (${board.id}) ---`);
        const { data: groups } = await supabase.from('groups').select('*').eq('board_id', board.id);
        console.log('Groups:', groups.map(g => ({ id: g.id, title: g.title })));
        
        const { data: items } = await supabase.from('items').select('id, name, values').eq('board_id', board.id);
        console.log('Items Count:', items?.length);
        
        const sitesFoundInItems = new Set();
        items?.forEach(i => {
            if (i.values?.site) sitesFoundInItems.add(i.values.site);
        });
        console.log('Sites found in items (values.site):', Array.from(sitesFoundInItems));
    }
}

inspectBoard();
