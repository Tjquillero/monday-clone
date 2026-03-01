
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkGroups() {
    const { data: groups } = await supabase.from('groups').select('id, title, board_id');
    console.log('TOTAL_GROUPS:', groups.length);
    groups.forEach(g => console.log(`GRP_INFO: id="${g.id}" title="${g.title}" board_id="${g.board_id}"`));
}

checkGroups();
