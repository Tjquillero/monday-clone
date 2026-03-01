import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Precise Cleanup Start...");
    
    // 1. Find the board
    const { data: boards } = await supabase.from('boards').select('*');
    const board = boards?.find(b => b.name?.includes('CONSERVACION') || b.name?.includes('038 - 2023'));
    
    if (!board) {
        console.log("Could not find board by name. Searching items in ALL boards.");
    } else {
        console.log(`Found Board: ${board.name} (${board.id})`);
    }

    // 2. Search for items by '0.0.0.0' code in values JSONB
    const { data: items, error } = await supabase
        .from('items')
        .select('id, name, values')
        .or('name.ilike.%GENERAL%,name.ilike.%NOMINA%');

    if (error) {
        console.error("Error fetching items:", error);
        return;
    }

    console.log(`Found ${items.length} suspicious items.`);
    
    const toDelete = items.filter(i => {
        const name = i.name.toUpperCase();
        return name.includes('GENERAL') || name.includes('NOMINA') || name.includes('NÓMINA') || i.values?.code === '0.0.0.0';
    });

    if (toDelete.length > 0) {
        console.log(`Deleting ${toDelete.length} items...`);
        const { error: delError } = await supabase
            .from('items')
            .delete()
            .in('id', toDelete.map(i => i.id));
        
        if (delError) console.error("Error deleting:", delError);
        else console.log("Success. Items removed.");
    } else {
        console.log("No items matched for deletion.");
    }
}

main().catch(console.error);
