import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function normalizeString(s) {
    if (!s) return '';
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function main() {
    console.log("Reading NEW excel file: Acta 32 ene-26.xlsx ...");
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const excelItems = [];
    for (let r=11; r<rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const code = String(row[0] || '').trim();
        const desc = String(row[1] || '').trim();
        const price = parseFloat(row[4]);
        
        if (code && desc && !isNaN(price)) {
            excelItems.push({
                code: code.replace(/,/g, '.'),
                desc: desc,
                normDesc: normalizeString(desc),
                price: price
            });
        }
    }
    
    console.log(`Parsed ${excelItems.length} valid items from Acta 32.`);
    
    const { data: dbItemsFull, error } = await supabase.from('items').select('id, name, values');
    if (error) {
        console.error("Error fetching items", error);
        return;
    }
    
    const dbItems = dbItemsFull.filter(i => i.values && i.values.item_type === 'financial');
    console.log(`Found ${dbItems.length} financial items in Supabase.`);

    let matchedCount = 0;
    let mismatchPriceCount = 0;
    let noMatchDbCount = 0;
    
    const toUpdate = [];

    for (const ex of excelItems) {
        // Try to find matching DB item
        let match = dbItems.find(db => {
            let extractedCode = String(db.values.code || '').trim().replace(/,/g, '.');
            if (extractedCode === ex.code) return true;
            
            const normName = db.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch && codeMatch[1].replace(/\.$/, '').replace(/,/g, '.') === ex.code) return true;
            
            if (normalizeString(db.name).includes(ex.normDesc)) return true;
            if (ex.normDesc.includes(normalizeString(db.name))) return true;
            
            return false;
        });

        if (match) {
            matchedCount++;
            const currentDbPrice = match.values.unit_price || 0;
            if (Math.abs(currentDbPrice - ex.price) > 0.01) {
                console.log(`[MISMATCH] Code ${ex.code}: DB Price = ${currentDbPrice}, Excel Price = ${ex.price}. Item: ${ex.desc.substring(0,30)}...`);
                mismatchPriceCount++;
                toUpdate.push({ id: match.id, newPrice: ex.price, values: match.values });
            }
        } else {
            console.log(`[NOT FOUND IN DB] Excel Code ${ex.code}: ${ex.desc.substring(0, 50)}...`);
            noMatchDbCount++;
        }
    }

    console.log(`\nSummary:`);
    console.log(`Matched Items: ${matchedCount} / ${excelItems.length}`);
    console.log(`Mismatched Prices to Fix: ${mismatchPriceCount}`);
    console.log(`Items in Excel not found in DB: ${noMatchDbCount}`);
    
    if (toUpdate.length > 0) {
        console.log(`\nApplying ${toUpdate.length} corrections...`);
        for (const u of toUpdate) {
            const newValues = { ...u.values, unit_price: u.newPrice };
            await supabase.from('items').update({ values: newValues }).eq('id', u.id);
        }
        console.log("Corrections applied. Please run recalculate script again.");
    }
}

main().catch(console.error);
