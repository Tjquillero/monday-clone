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
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }

    let out = "ITEMS STARTING WITH 2:\n";
    // Unique names
    let printed = new Set();
    
    for (const item of allItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const codeMatch = item.name.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode && extractedCode.startsWith('2.')) {
             let entry = `${extractedCode} | ${item.name.substring(0, 40)}`;
             if (!printed.has(entry)) {
                 out += entry + "\n";
                 printed.add(entry);
             }
        }
    }
    
    fs.writeFileSync('items_2_out.txt', out, 'utf8');
}
main().catch(console.error);
