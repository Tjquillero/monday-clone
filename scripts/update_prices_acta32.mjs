import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Reading NEW excel file: Acta 32 ene-26.xlsx ...");
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const codeToPrice = new Map();
    for (let r=11; r<rows.length; r++) { // Data starts at row 11 (0-indexed)
        const row = rows[r];
        if (!row) continue;
        const code = String(row[0] || '').trim(); // Col 0 is ITEM
        const price = parseFloat(row[4]); // Col 4 is V/UNIT
        
        if (code && !isNaN(price)) {
             // Normalize to dot-notation in case it comes as 1,01 instead of 1.01
            codeToPrice.set(code.replace(/,/g, '.'), price);
        }
    }
    
    console.log(`Parsed ${codeToPrice.size} codes from excel Acta 32.`);
    
    const { data: items, error } = await supabase.from('items').select('id, name, values');
    if (error) {
        console.error("Error fetching items", error);
        return;
    }
    
    let updatedCount = 0;
    
    // Update items matching the code
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
            // using a small epsilon to avoid small JS float mismatches locking out updates
            if (Math.abs((item.values.unit_price || 0) - newPrice) > 0.001) {
                const newValues = { ...item.values, unit_price: newPrice };
                const { error: upErr } = await supabase.from('items').update({ values: newValues }).eq('id', item.id);
                if (upErr) {
                    console.error("Failed to update item", item.id, upErr);
                } else {
                    console.log(`Updated item ID ${item.id} [Code: ${extractedCode}] to new price ${newPrice}`);
                    updatedCount++;
                }
            }
        }
    }
    
    console.log(`Finished updating ${updatedCount} items from Acta 32.`);
}

main().catch(console.error);
