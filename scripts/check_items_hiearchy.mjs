
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items } = await supabase.from('items').select('id, name, group_id');
    console.log('TOTAL ITEMS:', items?.length);
    const groupsInItems = new Set(items?.map(i => i.group_id));
    console.log('Unique group IDs in items:', groupsInItems.size);
    
    for (const gid of groupsInItems) {
      const { data: g } = await supabase.from('groups').select('title').eq('id', gid).single();
      console.log(` - Group ID: ${gid} Title: ${g?.title || 'UNKNOWN'}`);
    }
}

check();
