
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('*');
    console.log('Boards available:', boards.map(b => ({ id: b.id, name: b.name })));

    const { data: groups } = await supabase.from('groups').select('*');
    console.log('ALL groups in DB:', groups.map(g => ({ id: g.id, title: g.title, board_id: g.board_id })));
}

check();
