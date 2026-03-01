import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getAllItems() {
    let allItems = [];
    let start = 0;
    const limit = 1000;
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values, group_id')
            .range(start, start + limit - 1);
            
        if (error) {
            console.error("Error fetching items", error);
            break;
        }
        
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }
    return allItems;
}

async function main() {
    console.log("Reading Acta 32 ene-26.xlsx DETALLE DE ACTA ...");
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheetName = wb.SheetNames.find(s => s.trim().toUpperCase().includes('DETALLE'));
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const codeToData = new Map();
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const code = String(row[3] || '').trim().replace(/,/g, '.');
        const desc = String(row[4] || '').trim();
        const unit = String(row[5] || '').trim();
        const price = parseFloat(row[7]);
        if (code && /^[0-9]+(?:\.[0-9]+)+$/.test(code) && desc && !isNaN(price)) {
            codeToData.set(code, {
                code,
                name: `${code} ${desc}`,
                desc,
                price,
                unit
            });
        }
    }
    
    console.log(`Parsed ${codeToData.size} target items from Excel.`);

    const items = await getAllItems();
    console.log(`Fetched ${items.length} total items from Supabase.`);

    let updatedCount = 0;
    const updates = [];
    
    for (const item of items) {
        if (!item.values || (item.values.item_type !== 'financial')) continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }
        
        if (extractedCode && codeToData.has(extractedCode)) {
            const excelData = codeToData.get(extractedCode);
            
            let needsUpdate = false;
            let newValues = { ...item.values };
            let newName = item.name;
            
            if (Math.abs((newValues.unit_price || 0) - excelData.price) > 0.001) {
                newValues.unit_price = excelData.price;
                needsUpdate = true;
            }
            if (newValues.unit !== excelData.unit) {
                newValues.unit = excelData.unit;
                needsUpdate = true;
            }
            if (!newValues.code) {
                newValues.code = extractedCode;
                needsUpdate = true;
            }
            
            const normCurrent = newName.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const normExcel = excelData.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (normCurrent !== normExcel) {
                newName = normExcel;
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                updates.push(supabase.from('items').update({ name: newName, values: newValues }).eq('id', item.id));
                console.log(`Update [${item.group_id ? 'BOARD/GROUP' : 'MASTER'}] ${extractedCode}: Price ${item.values.unit_price} -> ${excelData.price}, Name: ${item.name.substring(0,30)} -> ${newName.substring(0,30)}`);
            }
        }
    }
    
    console.log(`Executing ${updates.length} updates across ALL nested board items...`);
    for (let i = 0; i < updates.length; i += 20) {
        await Promise.all(updates.slice(i, i + 20));
    }
    console.log(`Finished executing updates.`);
}

main().catch(console.error);
