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
    
    // Check details for each
    const ids = group3Masters.map(i => i.id);
    const { data: details } = await supabase.from('financial_acta_details').select('item_id').in('item_id', ids);
    let counts = {};
    if (details) {
        for (const d of details) {
            if (!counts[d.item_id]) counts[d.item_id] = 0;
            counts[d.item_id]++;
        }
    }
    
    console.log(`CURRENT GROUP 3 MASTERS:`);
    const sorted = group3Masters.sort((a,b) => {
        let codeA = Number(String(a.values?.code || a.name.match(/^([\d.]+)/)?.[1] || 0).replace('3.', ''));
        let codeB = Number(String(b.values?.code || b.name.match(/^([\d.]+)/)?.[1] || 0).replace('3.', ''));
        return codeA - codeB;
    });
    
    for (const m of sorted) {
        let detCount = counts[m.id] || 0;
        let code = String(m.values?.code || m.name.match(/^([\d.]+)/)?.[1] || '');
        console.log(`[${code.padEnd(4)}] ID: ${m.id} | Dtls: ${detCount} | Name: ${m.name.substring(0, 50)}`);
    }
}

main().catch(console.error);
