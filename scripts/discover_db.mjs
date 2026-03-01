import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Discovering relationships...");
    
    // Attempt to join items with groups and boards
    const { data: items, error } = await supabase
        .from('items')
        .select(`
            id,
            name,
            group_id,
            groups (
                id,
                title,
                board_id,
                boards (
                    id,
                    name
                )
            )
        `)
        .limit(5);

    if (error) {
        console.error("Join error:", error);
    } else {
        console.log("Items with joins:", JSON.stringify(items, null, 2));
    }
}

main().catch(console.error);
