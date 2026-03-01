import xlsx from 'xlsx';

const wb = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];

const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

for (let r=0; r<6; r++) {
    const row = rows[r];
    if (!row) continue;
    
    let line = `ROW ${r}: `;
    for (let c=0; c<10; c++) {
        const val = row[c];
        if (val !== undefined) {
             let str = String(val).replace(/\n/g, ' ').trim();
             if (str.length > 20) str = str.substring(0, 20) + '...';
             line += `[${c}]='${str}' `;
        }
    }
    console.log(line);
}
