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
        const price = parseFloat(row[7]);
        if (code && /^[0-9]+(?:\.[0-9]+)+$/.test(code) && desc && !isNaN(price)) {
            codeToData.set(code, { code, desc, price });
        }
    }

    const { data: items } = await supabase.from('items').select('id, name, values');
    let out = "DISCREPANCIES:\n\n";

    for (const item of items) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }

        if (extractedCode && codeToData.has(extractedCode)) {
            const excelData = codeToData.get(extractedCode);
            let diffs = [];
            
            if (Math.abs((item.values.unit_price || 0) - excelData.price) > 0.001) {
                diffs.push(`PRICE: DB=${item.values.unit_price} / EXCEL=${excelData.price}`);
            }
            
            const normDBDesc = item.name.replace(/^[0-9]+(?:\.[0-9]+)*[\s.\-:]*\s*/, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const normExcelDesc = excelData.desc.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (normDBDesc !== normExcelDesc) {
                // Ignore small differences in spaces, just check lowercased
                if (normDBDesc.toLowerCase() !== normExcelDesc.toLowerCase()) {
                    diffs.push(`DESC:\n  DB: ${normDBDesc}\n  EX: ${normExcelDesc}`);
                }
            }
            
            if (diffs.length > 0) {
                out += `ITEM ${extractedCode} (${item.id}):\n` + diffs.join("\n") + "\n\n";
            }
        }
    }
    fs.writeFileSync('discrepancies.txt', out, 'utf8');
    console.log("Check discrepancies.txt");
}

main().catch(console.error);
