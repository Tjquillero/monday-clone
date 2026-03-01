import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let output = "";
    const log = (str) => { output += str + "\n"; };

    log("Reading Acta 32 ene-26.xlsx ...");
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const excelData = [];
    for (let r=0; r<rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const code = String(row[0] || '').trim().replace(/,/g, '.');
        if (code === '2.01' || code === '2.02') {
            log(`\nEXCEL RECORD AT ROW ${r}:`);
            log(`  CODE: ${code}`);
            log(`  DESC: ${row[1]}`);
            log(`  V/UNIT (Col 4): ${row[4]}`);
            excelData.push({ code, price: parseFloat(row[4]) });
        }
    }
    
    log("\nFetching DB items for 2.01 and 2.02...");
    const { data: dbItems } = await supabase.from('items').select('id, name, values');
    
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode === '2.01' || extractedCode === '2.02') {
            log(`\nDB RECORD:`);
            log(`  ID: ${item.id}`);
            log(`  CODE (extracted): ${extractedCode}`);
            log(`  NAME: ${item.name}`);
            log(`  V/UNIT: ${item.values.unit_price}`);
        }
    }
    
    fs.writeFileSync('diag_201.txt', output, 'utf8');
}

main().catch(console.error);
