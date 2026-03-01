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
    let itemsFound = [];
    
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
             if (code && (code.startsWith('4.') || code.startsWith('5.') || code === '4' || code === '5')) {
                 itemsFound.push({ ...i, extractedCode: code });
             }
        }
        start += limit;
    }
    
    let out = "--- GROUPS 4 AND 5 MASTERS ---\n";
    const masters = itemsFound.filter(i => !i.board_id);
    
    // Sort by code
    masters.sort((a,b) => {
        let nA = Number(a.extractedCode.replace(/[^0-9.]/g, ''));
        let nB = Number(b.extractedCode.replace(/[^0-9.]/g, ''));
        return nA - nB;
    });
    
    for (const m of masters) {
        out += `Code: ${m.extractedCode.padEnd(6)} | ID: ${m.id} | Group: ${m.group_id} | Name: ${m.name.substring(0, 50)}\n`;
    }
    
    fs.writeFileSync('groups_4_5_dump.txt', out, 'utf8');
}
main().catch(console.error);
