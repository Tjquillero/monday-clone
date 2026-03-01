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
    let allItems = [];
    
    while (true) {
        const { data: items } = await supabase
            .from('items')
            .select('id, name, values, board_id')
            .range(start, start + limit - 1)
            .is('board_id', null);
            
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }
    
    let prefixes = {};
    for (const i of allItems) {
         let code = String(i.values?.code || '').trim();
         if (!code) {
              const match = i.name.match(/^([^\s.-]+)/);
              if (match) code = match[1];
         }
         if (code) {
             let prefixMatch = code.match(/^(\d+|\D+)/); // Just first part
             let prefix = prefixMatch ? prefixMatch[1] : code;
             if (!prefixes[prefix]) prefixes[prefix] = 0;
             prefixes[prefix]++;
         }
    }
    
    fs.writeFileSync('all_prefixes.json', JSON.stringify(prefixes, null, 2), 'utf8');
}
main().catch(console.error);
