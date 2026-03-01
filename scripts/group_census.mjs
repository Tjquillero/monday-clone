
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: groups } = await supabase.from('groups').select('id, title');
    for (const g of groups) {
        const { count } = await supabase.from('items').select('*', { count: 'exact' }).eq('group_id', g.id);
        console.log(`G[${g.title}] ID[${g.id}] COUNT: ${count}`);
    }
}

check();
