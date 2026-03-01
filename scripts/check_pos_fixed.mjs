
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: g } = await supabase.from('groups').select('*').eq('board_id', '3ea0326f-6ff7-409f-848a-1f296e6e3cc8').order('position');
    if (g) g.forEach(x => console.log(`POS: ${x.position} | TITLE: ${x.title}`));
}

check();
