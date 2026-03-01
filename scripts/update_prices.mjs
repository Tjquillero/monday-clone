import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Reading excel file...");
    const wb = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const codeToPrice = new Map();
    for (let r=2; r<rows.length; r++) { // skip header
        const row = rows[r];
        if (!row) continue;
        const code = String(row[1] || '').trim(); // Col 1
        const price = parseFloat(row[6]); // Col 6 is Vr. UNITARIO 2026
        
        if (code && !isNaN(price)) {
            codeToPrice.set(code.replace(/,/g, '.'), price);
        }
    }
    
    console.log(`Parsed ${codeToPrice.size} codes from excel.`);
    
    // Fetch all items from DB that might be financial
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
            if (item.values.unit_price !== newPrice) {
                const newValues = { ...item.values, unit_price: newPrice };
                const { error: upErr } = await supabase.from('items').update({ values: newValues }).eq('id', item.id);
                if (upErr) {
                    console.error("Failed to update item", item.id, upErr);
                } else {
                    console.log(`Updated item ID ${item.id} [Code: ${extractedCode}] to price ${newPrice}`);
                    updatedCount++;
                }
            }
        }
    }
    
    console.log(`Finished updating ${updatedCount} items.`);
}

main().catch(console.error);
