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

    const group3 = allItems.filter(i => {
         const name = typeof i.name === 'string' ? i.name : '';
         return name.startsWith('3') || name.includes('3.1');
    });

    console.log(`Found ${group3.length} items loosely matching group 3.`);
    fs.writeFileSync('group3_items.json', JSON.stringify(group3, null, 2), 'utf8');
}
main().catch(console.error);
