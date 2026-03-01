import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Looking for an item that is heavily referenced...");
    
    // Check tables: okr_links, comments, task_dependencies, activity_log
    const tables = ['okr_links', 'comments', 'task_dependencies', 'activity_log'];
    let targetItemId = null;
    
    for (const t of tables) {
        // Find an item_id referenced in this table
        // For task_dependencies, it might be predecessor_id or successor_id
        try {
            if (t === 'task_dependencies') continue;
            const { data } = await supabase.from(t).select('item_id').limit(1).not('item_id', 'is', null);
            if (data && data.length > 0) {
                targetItemId = data[0].item_id;
                console.log(`Found item ${targetItemId} referenced in ${t}`);
                break;
            }
        } catch (e) { }
    }
    
    if (!targetItemId) {
        // Try getting the oldest item
        const { data } = await supabase.from('items').select('id, name').order('created_at', { ascending: true }).limit(5);
        if (data && data.length > 0) {
            targetItemId = data[0].id;
            console.log(`No clear references found. Picking oldest item: ${targetItemId} (${data[0].name})`);
        }
    }
    
    if (targetItemId) {
        console.log(`Attempting to delete item ${targetItemId} to capture the exact DB error...`);
        const { error } = await supabase.from('items').delete().eq('id', targetItemId);
        if (error) {
            console.error("EXACT DB ERROR PREVENTING DELETION:");
            console.error(JSON.stringify(error, null, 2));
        } else {
            console.log("Deletion succeeded! This means the DB allowed it.");
            // We should recreate it or let it be if it was safe.
        }
    } else {
        console.log("No items found to test.");
    }
}
main().catch(console.error);
