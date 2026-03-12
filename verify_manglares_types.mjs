
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: g } = await supabase.from('groups').select('*').ilike('title', 'MANGLARES').single();
    if (!g) { console.log('MANGLARES not found'); return; }
    
    const { data: items } = await supabase.from('items').select('*').eq('group_id', g.id);
    console.log(`Group: ${g.title} ID: ${g.id}`);
    console.log(`Found ${items.length} items`);
    items.forEach(i => {
        console.log(` - Item: ${i.name} Type: ${i.values?.item_type} Rubro: ${i.values?.rubro}`);
    });
}

check();
