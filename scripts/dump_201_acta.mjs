import xlsx from 'xlsx';

function main() {
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    for(let r=0; r<rows.length; r++) {
        const row = rows[r];
        if(!row) continue;
        const code = String(row[0] || '').trim();
        // Maybe the code is not in col 0? In the screenshot it's D.
        // Let's print out rows that mention '2.01' anywhere
        for (let i = 0; i < row.length; i++) {
            if (String(row[i]).trim() === '2.01') {
                console.log(`\n============================`);
                console.log(`Found 2.01 at row ${r}, col ${i}`);
                for (let j = 0; j < Math.max(row.length, 12); j++) {
                     console.log(`  Col ${j}: ${row[j]}`);
                }
            }
        }
    }
}
main();
