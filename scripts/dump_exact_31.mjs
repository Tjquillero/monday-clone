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
    let targetItems = [];
    
    while (true) {
        const { data: items } = await supabase
            .from('items')
            .select('id, name, values, group_id, board_id')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             let code = String(i.values?.code || '').trim();
             if (!code) {
                 const match = i.name.match(/^(\d+(?:\.\d+)*)/);
                 if (match) code = match[1];
             }
             if (code === '3.1' || code === '3.10' || code === '3.12') {
                 targetItems.push(i);
             }
        }
        start += limit;
    }
    
    for (const t of targetItems) {
        let code = String(t.values?.code || '').trim();
        if (!code) {
            const match = t.name.match(/^(\d+(?:\.\d+)*)/);
            if (match) code = match[1];
        }
        console.log(`\nID: ${t.id}`);
        console.log(`Name: ${t.name.substring(0, 100)}`);
        console.log(`Code: ${code}`);
        console.log(`Group: ${t.group_id} | Board: ${t.board_id}`);
    }
}
main().catch(console.error);
