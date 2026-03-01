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
            .select('id, name, values')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        
        for (const item of items) {
            if (item.name.includes('PODA TECNICA Y FORMATIVA') || String(item.values?.code) === '2.2') {
                 console.log(`\nFound target item ` + item.id);
                 console.log(`  Name: ${item.name}`);
                 console.log(`  Code: ${item.values?.code}`);
                 console.log(`  Item Type: ${item.values?.item_type}`);
            }
        }
        start += limit;
    }
}
main().catch(console.error);
