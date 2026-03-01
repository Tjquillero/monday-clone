
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkGroups() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    const board = boards[0];
    const { data: groups } = await supabase.from('groups').select('id, title').eq('board_id', board.id);
    console.log(`BOARD_GROUPS_JSON:${JSON.stringify(groups)}:END_JSON`);
}

checkGroups();
