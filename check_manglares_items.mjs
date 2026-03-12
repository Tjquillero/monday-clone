
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: g } = await s.from('groups').select('*').ilike('title', 'MANGLARES').single();
    const { data: items } = await s.from('items').select('*').eq('group_id', g.id);
    for (const i of items) {
        console.log(`ITEM: ${i.name} | Qty: ${i.values?.cant} | Price: ${i.values?.unit_price} | ExecQty: ${i.values?.executed_qty}`);
    }
}
run();
