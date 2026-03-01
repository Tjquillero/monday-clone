import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Dumping first 100 names...");
    const { data: items } = await supabase.from('items').select('name').limit(100);
    if (items) {
        items.forEach(i => console.log(`|${i.name}|`));
    }
}

main().catch(console.error);
