
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: g } = await s.from('groups').select('*').ilike('title', 'MANGLARES').single();
    if (!g) return;
    const { data: items } = await s.from('items').select('*').eq('group_id', g.id);
    for (const i of items) {
       console.log(`[${g.title}] ${i.name} -> Q:${i.values.cant} P:${i.values.unit_price} E:${i.values.executed_qty}`);
    }
}
run();
