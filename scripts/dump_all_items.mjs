import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let start = 0;
    const limit = 1000;
    let allItems = [];
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values, board_id')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }

    fs.writeFileSync('all_items_dump.json', JSON.stringify(allItems, null, 2), 'utf8');
    
    let out = "ALL ITEMS DUMP:\n";
    for(const i of allItems) {
         out += `ID: ${i.id} | Name: ${i.name?.substring(0, 40)} | Board: ${i.board_id || 'MASTER'}\n`;
    }
    fs.writeFileSync('all_items_list.txt', out, 'utf8');
}
main().catch(console.error);
