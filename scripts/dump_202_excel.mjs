import xlsx from 'xlsx';

function main() {
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const sheetName = wb.SheetNames.find(s => s.trim().toUpperCase().includes('DETALLE'));
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const code = String(row[3] || '').trim();
        if (code === '2.02' || code === '2.2') {
             console.log(`Row ${r}:`);
             console.log(`  Code Col 3: ${code}`);
             console.log(`  Desc Col 4: ${row[4]}`);
        }
    }
}
main();
