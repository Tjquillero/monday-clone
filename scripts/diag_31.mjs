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
    let itemsFound = [];
    
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
             if (code && code.startsWith('3.1')) {
                 itemsFound.push(i);
             }
        }
        start += limit;
    }
    
    console.log(`=== MASTER ITEMS MATCHING 3.1* ===`);
    const masters = itemsFound.filter(i => !i.board_id);
    for (const m of masters) {
        console.log(`ID: ${m.id} | Name: ${m.name}`);
    }
    
    console.log(`\n=== ALL ITEMS MATCHING 3.1* (${itemsFound.length} total) ===`);
    const groupedByCode = {};
    for (const i of itemsFound) {
        let code = String(i.values?.code || '').trim();
        if (!code) {
           const match = i.name.match(/^(\d+(?:\.\d+)*)/);
           if (match) code = match[1];
        }
        if (!groupedByCode[code]) groupedByCode[code] = 0;
        groupedByCode[code]++;
    }
    
    for (const [code, count] of Object.entries(groupedByCode)) {
         console.log(`Code ${code}: ${count} items`);
    }

    // Check financial_acta_details for 3.1 master or board items if they exist
    // Let's see if there are details blocking deletion.
    console.log('\nChecking details for potential "3.1" exactly items:');
    const exact31 = itemsFound.filter(i => {
       let code = String(i.values?.code || '').trim();
       if (!code) {
           const match = i.name.match(/^(\d+(?:\.\d+)*)/);
           if (match) code = match[1];
       }
       return code === '3.1' || code === '3.10' || code === '3.12';
    });
    
    const ids = exact31.map(i => i.id);
    if (ids.length > 0) {
        const { data: details } = await supabase.from('financial_acta_details').select('id, item_id, quantity').in('item_id', ids);
        console.log(`Found ${details?.length || 0} details linked to exact 3.1/3.10/3.12 items.`);
        
        let counts = {};
        if (details) {
            for (const d of details) {
                if (!counts[d.item_id]) counts[d.item_id] = 0;
                counts[d.item_id]++;
            }
        }
        for (const [itemId, count] of Object.entries(counts)) {
            const item = itemsFound.find(i => i.id === itemId);
            console.log(`  Item ${itemId} (${item?.name.substring(0,20)}) has ${count} details.`);
        }
    }
}
main().catch(console.error);
