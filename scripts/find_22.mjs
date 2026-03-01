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
    let itemsFound = 0;
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             if (i.name && i.name.includes('2.2') || (i.values && i.values.code && i.values.code.includes('2.2'))) {
                 itemsFound++;
                 console.log(`Found: ${i.name}, code: ${i.values?.code}`);
             }
        }
        start += limit;
    }
    console.log(`Total 2.2* related items found: ${itemsFound}`);
}
main();
