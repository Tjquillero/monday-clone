
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: b } = await s.from('boards').select('*').limit(1);
    const { data: items } = await s.from('items').select('*').eq('board_id', b[0].id);
    let n = [];
    for (const i of items) {
       const q = i.values?.cant || 0;
       const p = i.values?.unit_price || 0;
       const e = i.values?.executed_qty || 0;
       if ((q*p) < 0 || (e*p) < 0) {
           n.push({ name: i.name, group: i.group_id, q, p, e, total: q*p });
       }
    }
    console.log('Negative Sum Items:', n.length);
    for (const i of n) {
        const {data:g}=await s.from('groups').select('title').eq('id', i.group).single();
        console.log(`[${g.title}] ${i.name} -> Q:${i.q} P:${i.p} E:${i.e} total:${i.total}`);
    }
}
run();
