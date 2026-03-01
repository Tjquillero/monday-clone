
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addDummyItem() {
    const boardId = '41bdd7d8-f199-45da-b781-5a00e5ccde05';
    // Get Manglares group on this board
    const { data: m } = await supabase.from('groups').select('*').eq('board_id', boardId).ilike('title', 'MANGLARES').limit(1).single();
    if (!m) { 
        console.log(`Manglares not found on board ${boardId}. Let's check groups there.`);
        const { data: gg } = await supabase.from('groups').select('title').eq('board_id', boardId);
        console.log(`Groups on Board ${boardId}:`, gg.map(g => g.title));
        return; 
    }
    
    console.log(`Adding dummy item to Group: ${m.title} Board: ${m.board_id}`);
    
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
    console.log('Dummy item added to Jan 25 board.');
}

addDummyItem();
