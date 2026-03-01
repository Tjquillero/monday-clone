import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Checking all items to find the intruders...");
    const { data: items, error } = await supabase.from('items').select('id, name').limit(10);
    
    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("First 10 items in DB:");
    items.forEach(i => console.log(`- ID: ${i.id} | Name: [${i.name}]`));

    // Nuclear delete using specific names from the screenshot
    const targets = [
        'NÓMINA - GENERAL',
        'INSUMOS - GENERAL',
        'TRANSPORTE - GENERAL',
        'FIJO - GENERAL',
        'CAJA MENOR - GENERAL'
    ];

    for (const name of targets) {
        console.log(`Searching for exact match: [${name}]`);
        const { data: found } = await supabase.from('items').select('id').eq('name', name);
        if (found && found.length > 0) {
            console.log(`Found ${found.length} items for ${name}. Deleting...`);
            await supabase.from('items').delete().eq('name', name);
        } else {
             // Try without accents if it fails
             const plainName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
             console.log(`Trying without accents: [${plainName}]`);
             await supabase.from('items').delete().ilike('name', `%${plainName}%`);
        }
    }
    console.log("Cleanup attempt finished.");
}

main().catch(console.error);
