
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: m } = await supabase.from('groups').select('*').ilike('title', 'MANGLARES').single();
    if (!m) { console.log('Manglares not found'); return; }
    
    console.log(`Checking items for Group: ${m.title} (ID: ${m.id})`);
    const { data: items } = await supabase.from('items').select('*').eq('group_id', m.id);
    console.log(`Found ${items?.length} items.`);
    if (items) {
      items.forEach(i => console.log(` - ${i.name} | Values: ${JSON.stringify(i.values)}`));
    }
}

check();
