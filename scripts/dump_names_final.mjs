import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: items } = await supabase.from('items').select('name');
    const names = items.map(i => i.name).join('\n');
    fs.writeFileSync('all_names_dump.txt', names);
    console.log(`Dumped ${items.length} names.`);
}

main().catch(console.error);
