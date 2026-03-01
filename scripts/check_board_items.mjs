import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    // 1. Get all Master Items
    const { data: masterItems } = await supabase.from('items').select('*').is('board_id', null);
    
    // 2. Get all Board Items
    const { data: boardItems } = await supabase.from('items').select('*').not('board_id', 'is', null);

    console.log(`Master Items: ${masterItems.length}`);
    console.log(`Board Items: ${boardItems.length}`);
    
    // Check item 2.01 in BOARD items
    let out = "BOARD ITEMS FOR 2.01:\n";
    for (const bItem of boardItems) {
        let extractedCode = String(bItem.values?.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = bItem.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode === '2.01' || bItem.name.includes('2.01')) {
             out += `ID: ${bItem.id} | Board: ${bItem.board_id} | Group: ${bItem.group_id}\n`;
             out += `  Name: ${bItem.name.substring(0, 50)}\n`;
             out += `  Price: ${bItem.values?.unit_price}\n\n`;
        }
    }
    
    fs.writeFileSync('board_items_201.txt', out, 'utf8');
    console.log("Check board_items_201.txt");
}
main().catch(console.error);
