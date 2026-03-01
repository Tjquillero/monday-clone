import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
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
            .select('id, name, values, group_id')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }

    let out = "GROUP 3 ITEMS:\n";
    const group3 = allItems.filter(i => {
         let n = i.name || '';
         let c = i.values?.code || '';
         return n.startsWith('3.') || c.startsWith('3.');
    });

    for (const g of group3) {
         out += `ID: ${g.id} | Code: ${g.values?.code} | Name: ${g.name.substring(0, 50)} | Group: ${g.group_id}\n`;
    }
    fs.writeFileSync('group_3_all.txt', out, 'utf8');
    
    const detailsQuery = await supabase.from('financial_acta_details').select('item_id');
    const detailsCounts = {};
    if (detailsQuery.data) {
         for (const d of detailsQuery.data) {
             detailsCounts[d.item_id] = (detailsCounts[d.item_id] || 0) + 1;
         }
    }
    
    out += `\n\nDETAILS COUNTS:\n`;
    for (const g of group3) {
         if (detailsCounts[g.id]) out += `ID: ${g.id} has ${detailsCounts[g.id]} details.\n`;
    }
    fs.writeFileSync('group_3_all.txt', out, 'utf8');

}
main().catch(console.error);
