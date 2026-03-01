
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkAndAdd() {
    const boardId = '41bdd7d8-f199-45da-b781-5a00e5ccde05';
    const { data: b } = await supabase.from('boards').select('name').eq('id', boardId).single();
    if (!b)  { console.log('Board not found'); return; }
    console.log(`Checking board: ${b.name}`);

    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', boardId);
    console.log(`Current groups: ${groups.map(g => g.title)}`);

    if (!groups.some(g => g.title.toUpperCase().includes('MANGLARES'))) {
        console.log('Adding MANGLARES to this board...');
        await supabase.from('groups').insert({
            board_id: boardId,
            title: 'MANGLARES',
            color: '#3b82f6',
            position: groups.length
        });
    } else {
        console.log('MANGLARES already there');
    }
}

checkAndAdd();
