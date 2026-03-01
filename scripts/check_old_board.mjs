
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const boardId = '41bdd7d8-f199-45da-b781-5a00e5ccde05';
    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', boardId);
    console.log(`Groups on board ${boardId}:`, groups.map(g => g.title));
    
    // Check item counts
    for(const g of groups) {
       const { count } = await supabase.from('items').select('*', { count: 'exact' }).eq('group_id', g.id);
       console.log(`Group ${g.title} has ${count} items.`);
    }
}

check();
