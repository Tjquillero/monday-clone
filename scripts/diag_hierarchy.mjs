import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking database...");
    
    const { data: boards } = await supabase.from('boards').select('*');
    console.log("Boards count:", boards?.length || 0);

    const { data: groups } = await supabase.from('groups').select('*').limit(5);
    console.log("Groups sample:", groups);

    const { data: items } = await supabase.from('items').select('*').limit(1);
    console.log("Items sample:", items);

    if (items && items.length > 0) {
        console.log("Item 1 parent group ID:", items[0].group_id);
    }
}

main().catch(console.error);
