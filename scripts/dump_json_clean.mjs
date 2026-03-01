import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let start = 0;
    const limit = 1000;
    let group3Masters = [];
    
    while (true) {
        const { data: items } = await supabase
            .from('items')
            .select('id, name, values, board_id')
            .range(start, start + limit - 1)
            .is('board_id', null);
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             let code = String(i.values?.code || '').trim();
             if (!code) {
                 const match = i.name.match(/^(\d+(?:\.\d+)*)/);
                 if (match) code = match[1];
             }
             if (code && code.startsWith('3.')) {
                 group3Masters.push(i);
             }
        }
        start += limit;
    }
    
    fs.writeFileSync('group3_clean.json', JSON.stringify(group3Masters, null, 2), 'utf8');
}
main().catch(console.error);
