
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', boardId).order('position');
    console.log('Board Groups (Ordered):');
    groups.forEach(g => console.log(` - POS: ${g.position} | TITLE: [${g.title}] | ID: ${g.id}`));
}

check();
