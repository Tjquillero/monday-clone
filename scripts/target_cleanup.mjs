import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Cleaning up exactly the items I inserted (Code: 0.0.0.0)...");
    
    // Deleting by the unique code I assigned in the SQL script
    const { data: deleted, error } = await supabase
        .from('items')
        .delete()
        .eq('values->>code', '0.0.0.0')
        .select('id, name');

    if (error) {
        console.error("Error during cleanup:", error);
    } else {
        console.log(`Cleanup complete. Deleted ${deleted?.length || 0} items.`);
        if (deleted) {
            deleted.forEach(item => console.log(`- Removed: ${item.name}`));
        }
    }
}

main().catch(console.error);
