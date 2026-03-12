
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    // 1. Clean Manglares to have zeroed financial items
    const { data: b } = await supabase.from('boards').select('*').limit(1);
    const { data: g } = await supabase.from('groups').select('*').ilike('title', 'MANGLARES').single();
    if (g) {
        // Delete current items and recreate from Plaza to ensure fresh state
        await supabase.from('items').delete().eq('group_id', g.id);
        
        const { data: plaza } = await supabase.from('groups').select('*, items(*)').ilike('title', 'Plaza Puerto Colombia').single();
        if (plaza) {
            const itemsToCopy = (plaza.items || []).filter(i => i.values?.item_type === 'financial' || i.item_type === 'financial');
            const copies = itemsToCopy.map(i => ({
                board_id: b[0].id,
                group_id: g.id,
                name: i.name,
                position: i.position,
                values: {
                    ...i.values,
                    item_type: 'financial',
                    cant: 0,
                    executed_qty: 0,
                    unit_price: i.values.unit_price || 0
                }
            }));
            await supabase.from('items').insert(copies);
        }
    }
    console.log('Fixed Manglares data.');
}
fix();
