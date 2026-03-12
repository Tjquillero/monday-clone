
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('*').order('created_at', { ascending: false }).limit(1);
    const board = boards[0];
    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', board.id);
    console.log(`Board [${board.name}]:`, groups.map(g => `${g.title} (ID:${g.id})`));
}

check();
