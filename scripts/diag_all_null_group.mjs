import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let start = 0;
    const limit = 1000;
    
    console.log("Fetching items with group_id = null...");
    let count = 0;
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values, group_id, board_id')
            .range(start, start + limit - 1)
            .is('group_id', null);
            
        if (error) {
            console.error("Supabase Error:", error);
            break;
        }
        if (!items || items.length === 0) break;
        
        for (const i of items) {
            count++;
            console.log(`[${count}] ID: ${i.id} | Name: ${i.name.substring(0, 50)} | Board: ${i.board_id}`);
        }
        start += limit;
    }
    console.log(`Total found: ${count}`);
}
main().catch(console.error);
