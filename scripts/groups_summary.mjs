
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log('Boards:', boards);

    const { data: groups } = await supabase.from('groups').select('id, title, board_id');
    groups.forEach(g => {
        const board = boards.find(b => b.id === g.board_id);
        console.log(`GROUP: [${g.title}] on BOARD: [${board?.name || 'UNKNOWN'}] (${g.board_id})`);
    });
}

check();
