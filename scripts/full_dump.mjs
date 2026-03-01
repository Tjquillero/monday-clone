import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Dumping all items...");
    const { data: items } = await supabase.from('items').select('id, name');
    const content = items?.map(i => `${i.id}|${i.name}`).join('\n');
    fs.writeFileSync('full_items_dump.txt', content || '');
    console.log(`Dumped ${items?.length || 0} items.`);
}

main().catch(console.error);
