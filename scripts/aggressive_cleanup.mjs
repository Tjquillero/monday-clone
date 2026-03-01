import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for ALL items containing 'GENERAL' to remove them from Acta...");
    
    // Fetching items to make sure we find them
    const { data: items, error: fetchError } = await supabase
        .from('items')
        .select('id, name');

    if (fetchError) {
        console.error("Fetch error:", fetchError);
        return;
    }

    const toDelete = items.filter(i => 
        i.name.toUpperCase().includes('GENERAL')
    );

    console.log(`Found ${toDelete.length} items to potentially delete.`);
    
    if (toDelete.length > 0) {
        const ids = toDelete.map(i => i.id);
        const { error: delError } = await supabase
            .from('items')
            .delete()
            .in('id', ids);

        if (delError) {
            console.error("Delete error:", delError);
        } else {
            console.log(`Successfully removed ${toDelete.length} "GENERAL" items.`);
            toDelete.forEach(i => console.log(`- Removed: ${i.name}`));
        }
    } else {
        console.log("No items found with 'GENERAL' in name.");
    }
}

main().catch(console.error);
