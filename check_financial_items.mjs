
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: b } = await s.from('boards').select('*').limit(1);
    const { data: gs } = await s.from('groups').select('*').eq('board_id', b[0].id).order('position');
    for (const g of gs) {
        const { data: i } = await s.from('items').select('*').eq('group_id', g.id);
        const fins = (i || []).filter(item => item.values?.item_type === 'financial' || item.item_type === 'financial').length;
        console.log(`GROUP: ${g.title} | POS: ${g.position} | TOTAL ITEMS: ${i.length} | FINANCIAL ITEMS: ${fins}`);
    }
}
run();
