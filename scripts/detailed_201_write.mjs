import xlsx from 'xlsx';
import fs from 'fs';

function main() {
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    let out = "";
    for(let r=0; r<rows.length; r++) {
        const row = rows[r];
        if(!row) continue;
        const code = String(row[0] || '').trim();
        if(code === '2.01' || code === '2.02') {
             out += `\n============ ITEM ${code} in Acta 32 ============\n`;
             out += `Col 0 ITEM: ${row[0]}\n`;
             out += `Col 1 DESC: ${String(row[1]).substring(0,20)}\n`;
             out += `Col 2 UNID: ${row[2]}\n`;
             out += `Col 3 CANT: ${row[3]}\n`;
             out += `Col 4 V/UNIT: ${row[4]}\n`;
             out += `Col 5 V/TOTAL: ${row[5]}\n`;
             out += `Col 6 CANT (Ant): ${row[6]}\n`;
             out += `Col 7 V/TOTAL: ${row[7]}\n`;
             out += `Col 8 CANT (Acta): ${row[8]}\n`;
             out += `Col 9 V/TOTAL: ${row[9]}\n`;
        }
    }
    fs.writeFileSync('out_det2.txt', out, 'utf8');
}
main();
