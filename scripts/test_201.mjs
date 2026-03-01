import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Reading Acta 32 ene-26.xlsx ...");
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const excelData = [];
    for (let r=0; r<rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const code = String(row[0] || '').trim().replace(/,/g, '.');
        if (code === '2.01' || code === '2.02') {
            console.log(`\nEXCEL RECORD AT ROW ${r}:`);
            console.log(`  CODE: ${code}`);
            console.log(`  DESC: ${row[1]}`);
            console.log(`  V/UNIT (Col 4): ${row[4]}`);
            console.log(`  Entire row:`, row);
            excelData.push({ code, price: parseFloat(row[4]) });
        }
    }
    
    console.log("\nFetching DB items for 2.01 and 2.02...");
    const { data: dbItems, error } = await supabase.from('items').select('id, name, values');
    
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode === '2.01' || extractedCode === '2.02') {
            console.log(`\nDB RECORD:`);
            console.log(`  ID: ${item.id}`);
            console.log(`  CODE (extracted): ${extractedCode}`);
            console.log(`  NAME: ${item.name}`);
            console.log(`  V/UNIT: ${item.values.unit_price}`);
            
            // fetch financial details
            const { data: details } = await supabase.from('financial_acta_details').select('quantity, value, previous_qty, previous_value').eq('item_id', item.id);
            console.log(`  Details count: ${details?.length || 0}`);
            if (details && details.length > 0) {
                 console.log(`  First detail sample: Qty=${details[0].quantity}, Value=${details[0].value}`);
            }
        }
    }
}

main().catch(console.error);
