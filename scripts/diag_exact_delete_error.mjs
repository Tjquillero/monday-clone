import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Fetching an old item to test deletion...");
    
    // Get an item that likely has dependencies (e.g. from group 3 or 4)
    const { data: items, error: fetchErr } = await supabase
        .from('items')
        .select('id, name')
        .limit(10);
        
    if (fetchErr || !items || items.length === 0) {
        console.error("Could not fetch items:", fetchErr);
        return;
    }
    
    let oldItem = items[0];
    console.log(`Attempting to delete item: ${oldItem.id} (${oldItem.name})`);
    
    // Attempt deletion
    const { data, error } = await supabase
        .from('items')
        .delete()
        .eq('id', oldItem.id);
        
    if (error) {
        console.error("DELETION FAILED!");
        console.error("Message:", error.message);
        console.error("Details:", error.details);
        console.error("Hint:", error.hint);
        console.error("Code:", error.code);
    } else {
        console.log("Deletion succeeded. Wait, if this succeeded, maybe the UI is failing somewhere else?");
    }
}
main().catch(console.error);
