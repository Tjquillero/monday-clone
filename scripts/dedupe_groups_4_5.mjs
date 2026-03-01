import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

let out = "";
function log(msg) {
    out += msg + "\n";
    console.log(msg);
}

async function run() {
    let start = 0;
    const limit = 1000;
    let group45 = [];
    
    log("Fetching items for groups 4 and 5...");
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values, group_id, created_at')
            .range(start, start + limit - 1);
            
        if (error) {
            log("Supabase Error: " + error.message);
            break;
        }
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             let code = String(i.values?.code || '').trim();
             if (!code) {
                 const match = i.name.match(/^(\d+(?:\.\d+)*)/);
                 if (match) code = match[1];
             }
             if (code && (code.startsWith('4.') || code.startsWith('5.') || code === '4' || code === '5')) {
                 group45.push({ ...i, calculated_code: code });
             }
        }
        start += limit;
    }

    log(`Total items found starting with 4 or 5: ${group45.length}`);

    const ids = group45.map(i => i.id);
    let counts = {};
    if (ids.length > 0) {
        const { data: details } = await supabase.from('financial_acta_details').select('item_id').in('item_id', ids);
        if (details) {
            for (const d of details) {
                if (!counts[d.item_id]) counts[d.item_id] = 0;
                counts[d.item_id]++;
            }
        }
    }
    
    // Group by code
    let byCode = {};
    for (const m of group45) {
        if (!byCode[m.calculated_code]) byCode[m.calculated_code] = [];
        byCode[m.calculated_code].push(m);
    }
    
    let deletedCount = 0;
    
    for (const [code, itemsList] of Object.entries(byCode)) {
        if (itemsList.length > 1) {
            log(`\nFound ${itemsList.length} items for code ${code}`);
            
            // Sort to keep item with details, or the older one (created_at)
            itemsList.sort((a,b) => {
                let countA = counts[a.id] || 0;
                let countB = counts[b.id] || 0;
                if (countA !== countB) return countB - countA; // higher count first
                return new Date(a.created_at) - new Date(b.created_at); // older first
            });
            
            const keeper = itemsList[0];
            const keeperCount = counts[keeper.id] || 0;
            log(`  [KEEP] ID: ${keeper.id} (Dtls: ${keeperCount}) : ${keeper.name.substring(0, 50)}`);
            
            for (let i = 1; i < itemsList.length; i++) {
                const dupe = itemsList[i];
                const dupeCount = counts[dupe.id] || 0;
                if (dupeCount > 0) {
                    log(`  [SKIP] Cannot delete ${dupe.id} because it has ${dupeCount} details!`);
                } else {
                    log(`  [DEL] Deleting duplicate ID: ${dupe.id} : ${dupe.name.substring(0, 50)}`);
                    await supabase.from('items').delete().eq('id', dupe.id);
                    deletedCount++;
                }
            }
        }
    }

    log(`\nFinished! Deleted ${deletedCount} duplicates.`);
    fs.writeFileSync('dedupe_4_5_out.txt', out, 'utf8');
}

run().catch(console.error);
