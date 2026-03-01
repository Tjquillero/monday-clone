import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: items } = await supabase
        .from('items')
        .select('id, name, values')
        .eq('group_id', '41bdd7d8-f199-45da-b781-5a00e5ccde05')
        .order('name');
        
    console.log(`Found ${items.length} items in Group 3:`);
    for (const i of items) {
        console.log(`ID: ${i.id} | Code: ${String(i.values?.code).padEnd(4)} | Name: ${i.name.substring(0, 50)}`);
    }
}
main().catch(console.error);
