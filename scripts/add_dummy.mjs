
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addDummyItem() {
    // Get Manglares group on the active board
    const { data: m } = await supabase.from('groups').select('*').ilike('title', 'MANGLARES').limit(1).single();
    if (!m) { console.log('Manglares group not found'); return; }
    
    console.log(`Adding dummy item to Group: ${m.title} Board: ${m.board_id}`);
    
    const { data: existingItems } = await supabase.from('items').select('*').eq('group_id', m.id).limit(1);
    if (existingItems && existingItems.length > 0) {
        console.log('Group already has items.');
        return;
    }

    await supabase.from('items').insert({
        group_id: m.id,
        board_id: m.board_id,
        name: 'INICIO DE PROYECTO',
        position: 0,
        values: {
            item_type: 'financial',
            rubro: 'NOMINA',
            category: 'OPERATIVOS',
            sub_category: 'General',
            unit: 'Und',
            cant: 0,
            unit_price: 0
        }
    });
    console.log('Dummy item added.');
}

addDummyItem();
