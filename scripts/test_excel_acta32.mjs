import xlsx from 'xlsx';
import fs from 'fs';

const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
// find the first sheet with data
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];

const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

let out = "";
for (let r=0; r<15; r++) {
    const row = rows[r];
    if (!row) continue;
    out += `ROW ${r}:\n`;
    for (let c=0; c<row.length; c++) {
        if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
            out += `  Col ${c}: ${String(row[c]).replace(/\n/g, ' ')}\n`;
        }
    }
}
fs.writeFileSync('excel_headers2.txt', out);
console.log('Done writing excel_headers2.txt');
