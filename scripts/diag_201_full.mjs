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
    
    // Find all item IDs for 2.01
    const { data: dbItems } = await supabase.from('items').select('id, name, values');
    const ids = [];
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        const code = String(item.values.code || '').trim().replace(/,/g, '.');
        if (code === '2.01' || item.name.includes('2.01')) {
            ids.push(item.id);
        }
    }
    
    out += `IDs for 2.01: ${ids.join(', ')}\n\n`;

    const { data: details } = await supabase.from('financial_acta_details').select('*').in('item_id', ids);
    for (const d of details) {
        out += `Detail ${d.id}:\n`;
        out += `  QTY: ${d.quantity} | VAL: ${d.value}\n`;
        out += `  PREV QTY: ${d.previous_qty} | PREV VAL: ${d.previous_value}\n\n`;
    }
    
    fs.writeFileSync('diag_201_full.txt', out, 'utf8');
}
main().catch(console.error);
