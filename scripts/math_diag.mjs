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
    const { data: dbItems, error } = await supabase.from('items').select('id, name, values');
    
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        const code = String(item.values.code || '').trim().replace(/,/g, '.');
        if (code === '2.01' || item.name.includes('2.01')) {
            out += `\nMASTER ITEM 2.01 -> ID: ${item.id}\n`;
            out += `unit_price in DB: ${item.values.unit_price}\n`;
            out += `cant in DB: ${item.values.cant}\n`;
            out += `Expected Budget Total: ${item.values.cant * item.values.unit_price}\n`;

            const { data: details } = await supabase.from('financial_acta_details').select('*').eq('item_id', item.id);
            for (const d of details) {
                out += `\n  DETAIL ROW -> Acta: ${d.acta_id}, Group: ${d.group_id}\n`;
                out += `  QTY: ${d.quantity}\n`;
                out += `  SAVED VALUE: ${d.value}\n`;
                out += `  Math Check: ${d.quantity} * ${item.values.unit_price} = ${d.quantity * item.values.unit_price}\n`;
                out += `  Is it correct?: ${Math.abs(d.value - (d.quantity * item.values.unit_price)) < 0.01 ? 'YES' : 'NO'}\n`;
            }
        }
    }
    fs.writeFileSync('diag_math.txt', out, 'utf8');
}
main().catch(console.error);
