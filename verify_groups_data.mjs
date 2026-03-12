
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('*').order('created_at', { ascending: false }).limit(1);
    const board = boards[0];
    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', board.id);
    
    for (const g of groups) {
        const { data: items } = await supabase.from('items').select('*').eq('group_id', g.id);
        let bTotal = 0;
        let eTotal = 0;
        items.forEach(i => {
           const qty = i.values?.cant || 0;
           const price = i.values?.unit_price || 0;
           const execQty = i.values?.executed_qty || 0;
           bTotal += qty * price;
           eTotal += execQty * price;
        });
        console.log(`Site: ${g.title} | Budget: ${bTotal} | Executed: ${eTotal} | Items: ${items.length} | ID: ${g.id}`);
    }
}

check();
