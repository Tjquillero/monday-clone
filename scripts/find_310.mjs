import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: dbItems, error } = await supabase.from('items').select('id, name, position, group_id, values');
    if (error) {
        console.error("Error fetching items", error);
        return;
    }

    let foundItem = null;
    for (const item of dbItems) {
        // Broad search for anything matching 3.10
        if (item.name.includes('3.10') || item.name.toLowerCase().includes('bombas centrifugas')) {
             foundItem = item;
             console.log(`\nPotential Match:`);
             console.log(`  ID: ${foundItem.id}`);
             console.log(`  Name: ${foundItem.name}`);
             console.log(`  Group ID: ${foundItem.group_id}`);
             console.log(`  Position: ${foundItem.position}`);
        }
    }
}

main().catch(console.error);
