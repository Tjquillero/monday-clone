import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: items } = await supabase.from('items').select('*');
    if (items) {
        fs.writeFileSync('all_items_final.json', JSON.stringify(items, null, 2));
        console.log(`Dumped ${items.length} items to all_items_final.json`);
    }
}

main().catch(console.error);
