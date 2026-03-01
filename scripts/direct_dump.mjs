import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: items } = await supabase.from('items').select('*');
    if (!items) return;
    
    for (const item of items) {
         if (item.name.startsWith('3.1 ') || item.name.startsWith('3.10 ') || item.name.startsWith('3.12 ') || String(item.values?.code) === '3.1' || String(item.values?.code) === '3.10' || String(item.values?.code) === '3.12') {
             console.log(`ID: ${item.id} | Name: ${item.name.substring(0, 60)} | Code: ${item.values?.code} | Board: ${item.board_id}`);
         }
    }
}
main().catch(console.error);
