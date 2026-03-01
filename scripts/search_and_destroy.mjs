import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for the intruders...");
    
    // Buscar ítems que contengan estas palabras clave
    const { data: items, error } = await supabase
        .from('items')
        .select('id, name, values')
        .or('name.ilike.%NOMINA%,name.ilike.%INSUMOS%,name.ilike.%TRANSPORTE%,name.ilike.%CAJA MENOR%,name.ilike.%FIJO%');

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (!items || items.length === 0) {
        console.log("No items found using name filter. Checking by code 0.0.0.0...");
        const { data: byCode } = await supabase.from('items').select('id, name').eq('values->>code', '0.0.0.0');
        if (byCode && byCode.length > 0) {
            console.log(`Found ${byCode.length} items by code 0.0.0.0. Deleting...`);
            await supabase.from('items').delete().in('id', byCode.map(i => i.id));
        } else {
            console.log("Nothing found by code either.");
        }
    } else {
        console.log(`Found ${items.length} items. Deleting them...`);
        items.forEach(i => console.log(`- Deleting: [${i.name}] (ID: ${i.id})`));
        const { error: delError } = await supabase.from('items').delete().in('id', items.map(i => i.id));
        if (delError) console.error("Error deleting:", delError);
        else console.log("Success. Items removed.");
    }

    // Comprobar si hay grupos con esos nombres por si acaso
    const { data: groups } = await supabase
        .from('groups')
        .select('id, title')
        .or('title.ilike.%NOMINA%,title.ilike.%INSUMOS%');
    
    if (groups && groups.length > 0) {
         console.log(`Found ${groups.length} groups that might be the issue. Deleting...`);
         await supabase.from('groups').delete().in('id', groups.map(g => g.id));
    }
}

main().catch(console.error);
