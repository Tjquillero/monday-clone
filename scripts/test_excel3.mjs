import xlsx from 'xlsx';
import fs from 'fs';

const wb = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

let out = "";
for (let r=0; r<10; r++) {
    const row = rows[r];
    if (!row) continue;
    out += `ROW ${r}:\n`;
    for (let c=0; c<row.length; c++) {
        if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
            out += `  Col ${c}: ${String(row[c]).replace(/\n/g, ' ')}\n`;
        }
    }
}
fs.writeFileSync('excel_headers.txt', out);
console.log('Done writing excel_headers.txt');
