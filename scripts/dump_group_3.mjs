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
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values, board_id')
            .range(start, start + limit - 1)
            .is('board_id', null);
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             const lowerName = i.name.toLowerCase();
             if (lowerName.startsWith('3.') || lowerName.includes('3.1') || lowerName.includes('3.0') || lowerName.match(/^3/)) {
                 console.log(`MASTER ITEM: ID=${i.id} | Name=${i.name}`);
             }
        }
        start += limit;
    }
}
main().catch(console.error);
