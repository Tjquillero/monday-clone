
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: items } = await s.from('items').select('*');
    if (!items) { console.log('No items'); return; }
    let negs = [];
    for (const i of items) {
       const q = parseFloat(i.values?.cant) || 0;
       const p = parseFloat(i.values?.unit_price) || 0;
       const e = parseFloat(i.values?.executed_qty) || 0;
       if ((q*p) < 0 || (e*p) < 0) {
           negs.push({ name: i.name, group: i.group_id, q, p, e, total: q*p });
       }
    }
    console.log('Negative items:', negs.length);
    for (const i of negs) {
        console.log(`[ID:${i.group}] ${i.name} -> Q:${i.q} P:${i.p} E:${i.e} total:${i.total}`);
    }
}
run();
