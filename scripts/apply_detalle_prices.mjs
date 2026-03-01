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
    const sheetName = wb.SheetNames.find(s => s.trim().toUpperCase().includes('DETALLE'));
    
    if (!sheetName) {
        console.error("Could not find 'DETALLE DE ACTA' sheet.");
        return;
    }
    
    console.log(`Using sheet: ${sheetName}`);
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const codeToPrice = new Map();
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        
        // In this sheet, Col 3 is the Item Code, Col 7 is the Unit Price
        const code = String(row[3] || '').trim();
        const price = parseFloat(row[7]);
        
        if (code && !isNaN(price)) {
            codeToPrice.set(code.replace(/,/g, '.'), price);
        }
    }
    
    console.log(`Parsed ${codeToPrice.size} unique codes from DETALLE DE ACTA.`);

    const { data: items, error } = await supabase.from('items').select('id, name, values');
    if (error) {
        console.error("Error fetching items", error);
        return;
    }

    let updatedCount = 0;
    for (const item of items) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode && codeToPrice.has(extractedCode)) {
            const newPrice = codeToPrice.get(extractedCode);
            if (Math.abs(item.values.unit_price - newPrice) > 0.001) {
                const newValues = { ...item.values, unit_price: newPrice };
                const { error: upErr } = await supabase.from('items').update({ values: newValues }).eq('id', item.id);
                if (upErr) {
                    console.error("Failed to update item", item.id, upErr);
                } else {
                    console.log(`Updated item ID ${item.id} [Code: ${extractedCode}] to correct DETALLE price ${newPrice}`);
                    updatedCount++;
                }
            }
        }
    }
    console.log(`Finished updating ${updatedCount} items with correct DETALLE DE ACTA prices.`);
}

main().catch(console.error);
