import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let out = "";
    function log(msg) {
        out += msg + "\n";
        console.log(msg);
    }

    let start = 0;
    const limit = 1000;
    let group45 = [];
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values, group_id')
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
    
    const sorted = group45.sort((a,b) => {
        let codeA_parts = (a.calculated_code || '0').split('.').map(Number);
        let codeB_parts = (b.calculated_code || '0').split('.').map(Number);
        if (codeA_parts[0] !== codeB_parts[0]) return codeA_parts[0] - codeB_parts[0];
        return (codeA_parts[1] || 0) - (codeB_parts[1] || 0);
    });
    
    let currentCode = null;
    let currentCodeItems = [];
    
    const printItems = (items) => {
        if (items.length > 1) {
             log(`\nDUPLICATE WARNING FOR CODE ${items[0].calculated_code}:`);
             for (const m of items) {
                 let detCount = counts[m.id] || 0;
                 log(`  -> ID: ${m.id} | Dtls: ${detCount} | Name: ${m.name.substring(0, 60)} | Grp: ${m.group_id}`);
             }
        } else if (items.length === 1) {
             const m = items[0];
             let detCount = counts[m.id] || 0;
             log(`[${m.calculated_code.padEnd(4)}] ID: ${m.id} | Dtls: ${detCount} | Name: ${m.name.substring(0, 60)} | Grp: ${m.group_id}`);
        }
    };

    log(`CURRENT GROUP 4 & 5 ITEMS (${group45.length} found):`);
    for (const m of sorted) {
        if (currentCode !== m.calculated_code) {
            if (currentCodeItems.length > 0) printItems(currentCodeItems);
            currentCode = m.calculated_code;
            currentCodeItems = [m];
        } else {
            currentCodeItems.push(m);
        }
    }
    if (currentCodeItems.length > 0) printItems(currentCodeItems);
    
    fs.writeFileSync('diag_4_5_out.txt', out, 'utf8');
}
main().catch(console.error);
