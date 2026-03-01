import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log("Boards found in DB:");
    boards?.forEach(b => console.log(`- [${b.name}] (ID: ${b.id})`));

    const { data: items } = await supabase.from('items').select('id, name').limit(10);
     console.log("Sample items in DB:");
    items?.forEach(i => console.log(`- [${i.name}]`));
}

main().catch(console.error);
