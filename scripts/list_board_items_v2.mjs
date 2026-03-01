
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
    const { data: items } = await supabase.from('items').select('id, name, group_id, values').eq('board_id', boardId);
    console.log(`Total items on board ${boardId}:`, items?.length);
    
    const groups = new Set(items?.map(i => i.group_id));
    console.log('Unique groups with items:', Array.from(groups));
    
    for (const gid of groups) {
      const { data: g } = await supabase.from('groups').select('title').eq('id', gid).single();
      console.log(`Group ID ${gid}: [${g?.title}]`);
    }
}

check();
