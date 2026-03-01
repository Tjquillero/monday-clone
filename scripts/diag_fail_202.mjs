import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const wb = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const codeToPrice = new Map();
    for (let r=2; r<rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const code = String(row[1] || '').trim();
        const price = parseFloat(row[6]);
        
        if (code === '2.02') {
             console.log(`POA Row ${r}: Code=${code}, Price=${price}`);
        }
        
        if (code && !isNaN(price)) {
            codeToPrice.set(code.replace(/,/g, '.'), price);
        }
    }
    
    console.log(`In Map 2.02 = ${codeToPrice.get('2.02')}`);
    
    const { data: items } = await supabase.from('items').select('id, name, values');
    for (const item of items) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode === '2.02') {
             console.log(`\nDB Item 2.02: ID=${item.id}, Name=${item.name.substring(0,30)}`);
             console.log(`DB Price: ${item.values.unit_price}`);
             const newPrice = codeToPrice.get('2.02');
             console.log(`Will it update? ${item.values.unit_price !== newPrice ? 'YES' : 'NO'}`);
             
             if (item.values.unit_price !== newPrice) {
                 const newValues = { ...item.values, unit_price: newPrice };
                 const { error: upErr } = await supabase.from('items').update({ values: newValues }).eq('id', item.id);
                 if (upErr) console.error("Error updating", upErr);
                 else console.log("Force updated 2.02 successfully!");
             }
        }
    }
}
main().catch(console.error);
