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
    let group3Items = [];
    
    while (true) {
        const { data: items } = await supabase
            .from('items')
            .select('id, name, values')
            .range(start, start + limit - 1)
            .eq('group_id', '41bdd7d8-f199-45da-b781-5a00e5ccde05');
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             let code = String(i.values?.code || '').trim();
             if (!code) {
                 const match = i.name.match(/^(\d+(?:\.\d+)*)/);
                 if (match) code = match[1];
             }
             if (code && code.startsWith('3.')) {
                 group3Items.push({ ...i, extractedCode: code });
             }
        }
        start += limit;
    }
    
    const ids = group3Items.map(i => i.id);
    const { data: details } = await supabase.from('financial_acta_details').select('item_id').in('item_id', ids);
    let counts = {};
    if (details) {
        for (const d of details) {
            if (!counts[d.item_id]) counts[d.item_id] = 0;
            counts[d.item_id]++;
        }
    }
    
    // 1. Rename 3.1 to 3.10
    const item3_1 = group3Items.find(i => i.extractedCode === '3.1');
    if (item3_1) {
        console.log(`Renaming 3.1 (${item3_1.id}) to 3.10...`);
        let newValues = { ...item3_1.values, code: '3.10' };
        let newName = item3_1.name.replace(/^3\.1\s/, '3.10 ');
        if (!newName.startsWith('3.10')) newName = '3.10 ' + newName.substring(3).trim();
        
        await supabase.from('items').update({
             name: newName,
             values: newValues
        }).eq('id', item3_1.id);
        item3_1.extractedCode = '3.10'; // Update local memory for deduping
    }

    // 2. Group by code and drop duplicates
    const codeMap = {};
    for (const i of group3Items) {
         if (!codeMap[i.extractedCode]) codeMap[i.extractedCode] = [];
         codeMap[i.extractedCode].push(i);
    }
    
    for (const [code, itemsList] of Object.entries(codeMap)) {
         if (itemsList.length > 1) {
              console.log(`\nFound ${itemsList.length} duplicates for ${code}`);
              itemsList.sort((a,b) => (counts[b.id] || 0) - (counts[a.id] || 0));
              
              const keeper = itemsList[0];
              console.log(`  [KEEP] ID: ${keeper.id} (${counts[keeper.id] || 0} details) : ${keeper.name.substring(0, 40)}`);
              
              for (let i = 1; i < itemsList.length; i++) {
                   const dupe = itemsList[i];
                   const dupeDetails = counts[dupe.id] || 0;
                   if (dupeDetails > 0) {
                        console.log(`  [SKIP] Cannot delete ${dupe.id} because it has ${dupeDetails} details.`);
                   } else {
                        console.log(`  [DEL] Deleting duplicate ID: ${dupe.id}`);
                        await supabase.from('items').delete().eq('id', dupe.id);
                   }
              }
         }
    }
    console.log("\nDone deduplicating.");
}

main().catch(console.error);
