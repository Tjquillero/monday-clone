import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Nuclear cleanup starting...");
    
    // Lista de nombres exactos para asegurar que se borran
    const namesToDelete = [
        'NÓMINA - GENERAL',
        'INSUMOS - GENERAL',
        'TRANSPORTE - GENERAL',
        'FIJO - GENERAL',
        'CAJA MENOR - GENERAL'
    ];

    console.log("Searching for items with names:", namesToDelete);

    const { data: items, error: fetchError } = await supabase
        .from('items')
        .select('id, name')
        .in('name', namesToDelete);

    if (fetchError) {
        console.error("Error fetching items to delete:", fetchError);
        return;
    }

    if (!items || items.length === 0) {
        console.log("No items found with those exact names. Trying case-insensitive search...");
        const { data: itemsCaps, error: fetchError2 } = await supabase
            .from('items')
            .select('id, name')
            .ilike('name', '%- GENERAL');
        
        if (itemsCaps && itemsCaps.length > 0) {
            console.log(`Found ${itemsCaps.length} items with '- GENERAL' suffix.`);
            const { error: delError } = await supabase
                .from('items')
                .delete()
                .in('id', itemsCaps.map(i => i.id));
            
            if (delError) console.error("Error during deletion:", delError);
            else console.log("Successfully deleted items found by suffix.");
        } else {
            console.log("No items found even with suffix search.");
        }
    } else {
        console.log(`Found ${items.length} items to delete.`);
        const { error: delError } = await supabase
            .from('items')
            .delete()
            .in('id', items.map(i => i.id));
        
        if (delError) console.error("Error deleting items:", delError);
        else console.log("Successfully deleted all selected items.");
    }
}

main().catch(console.error);
