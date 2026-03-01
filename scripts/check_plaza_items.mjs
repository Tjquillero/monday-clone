
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: g } = await supabase.from('groups').select('id').ilike('title', 'Plaza Puerto Colombia').single();
    if (!g) { console.log('Plaza not found'); return; }
    
    const { data: items } = await supabase.from('items').select('*').eq('group_id', g.id).limit(3);
    console.log('Sample Plaza items:', JSON.stringify(items, null, 2));
}

check();
