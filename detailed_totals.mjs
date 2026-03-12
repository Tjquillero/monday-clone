
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: b } = await s.from('boards').select('*').limit(1);
    const { data: g } = await s.from('groups').select('*').eq('board_id', b[0].id);
    for (const group of g) {
        const { data: items } = await s.from('items').select('*').eq('group_id', group.id);
        const { budget, exec } = items.reduce((acc, i) => {
            const q = i.values?.cant || 0;
            const p = i.values?.unit_price || 0;
            const e = i.values?.executed_qty || 0;
            return { budget: acc.budget + (q * p), exec: acc.exec + (e * p) };
        }, { budget: 0, exec: 0 });
        console.log(`SITE: ${group.title} | BUDGET: ${budget} | EXEC: ${exec} | ITEMS: ${items.length}`);
    }
}
run();
