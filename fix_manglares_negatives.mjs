
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    // 1. Fix the negative item in Manglares
    const { data: g } = await supabase.from('groups').select('*').ilike('title', 'MANGLARES').single();
    if (!g) { console.log('Manglares not found'); return; }
    
    // Find the item with negative executed_qty
    const { data: items } = await supabase.from('items').select('*').eq('group_id', g.id);
    for (const item of items) {
        if (item.values?.executed_qty < 0 || item.values?.cant < 0) {
            console.log(`Fixing item: ${item.name} in Manglares`);
            const newValues = { ...item.values, executed_qty: 0, cant: 0 };
            await supabase.from('items').update({ values: newValues }).eq('id', item.id);
        }
    }
    
    console.log('Fixed negative items.');
}

fix();
