
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
    
    // 1. Get Pto Colombia items as template
    const { data: plaza } = await supabase.from('groups').select('id').eq('board_id', boardId).ilike('title', 'Plaza Puerto Colombia').single();
    const { data: plazaItems } = await supabase.from('items').select('*').eq('group_id', plaza.id).limit(10);
    
    // 2. Get Manglares group
    const { data: manglares } = await supabase.from('groups').select('id').eq('board_id', boardId).ilike('title', 'MANGLARES').single();
    
    // 3. Update Manglares position to 1
    await supabase.from('groups').update({ position: 1 }).eq('id', manglares.id);
    // Move others if needed
    console.log('Manglares position updated to 1');

    // 4. Copy items
    if (plazaItems && plazaItems.length > 0) {
        const newItems = plazaItems.map(i => ({
            board_id: boardId,
            group_id: manglares.id,
            name: i.name,
            position: i.position,
            values: i.values
        }));
        await supabase.from('items').insert(newItems);
        console.log(`Copied ${newItems.length} items to Manglares.`);
    }
}

fix();
