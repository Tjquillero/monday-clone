import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    // 1. Fetch tables that have foreign keys pointing to items(id)
    const query = `
        SELECT
            tc.table_name, 
            kcu.column_name,
            rc.update_rule AS on_update,
            rc.delete_rule AS on_delete
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.referential_constraints AS rc
              ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND kcu.table_name != 'items'
          AND EXISTS (
              SELECT 1 FROM information_schema.constraint_column_usage ccu
              WHERE ccu.constraint_name = tc.constraint_name
                AND ccu.table_name = 'items'
          );
    `;

    // Since we can't run raw SQL from the JS client easily without RPC,
    // let's just make a dummy group, dummy item, and try to delete it to get the error message.
    
    console.log("Creating dummy board, group and item to test deletion...");
    const { data: board, error: bErr } = await supabase.from('boards').insert({ title: 'Delete Test Board' }).select().single();
    if (bErr) { console.error("Error creating board:", bErr); return; }
    
    const { data: group, error: gErr } = await supabase.from('groups').insert({ board_id: board.id, title: 'Test Group' }).select().single();
    if (gErr) { console.error("Error creating group:", gErr); return; }
    
    const { data: item, error: iErr } = await supabase.from('items').insert({ board_id: board.id, group_id: group.id, name: 'Test Delete Item' }).select().single();
    if (iErr) { console.error("Error creating item:", iErr); return; }
    
    console.log(`Created test item ${item.id}. Now attempting to delete...`);
    
    const { error: delErr } = await supabase.from('items').delete().eq('id', item.id);
    
    if (delErr) {
        console.error("DELETION FAILED! Error Details:");
        console.error(JSON.stringify(delErr, null, 2));
    } else {
        console.log("Deletion successful! The issue might be specific to old items.");
        
        // Let's try to delete a random old item but gracefully fail
        const { data: oldItems } = await supabase.from('items').select('id, name').limit(5);
        if (oldItems && oldItems.length > 0) {
            console.log("Testing deletion constraints on an existing item without removing it...");
            // We can't actually do a dry-run delete in supabase JS easily, 
            // but we can query dependent tables: activity_log, comments, task_dependencies?
        }
    }
    
    // Cleanup
    await supabase.from('boards').delete().eq('id', board.id);
}
main().catch(console.error);
