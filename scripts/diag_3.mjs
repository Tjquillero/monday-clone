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
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             let code = String(i.values?.code || '').trim();
             if (!code) {
                 const match = i.name.match(/^(\d+(?:\.\d+)*)/);
                 if (match) code = match[1];
             }
             if (code && code.startsWith('3.')) {
                 if (!i.board_id) {
                     console.log(`MASTER: code=${code} | name=${i.name}`);
                 }
             }
        }
        start += limit;
    }
}
main().catch(console.error);
