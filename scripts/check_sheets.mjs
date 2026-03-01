import xlsx from 'xlsx';

function main() {
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    console.log("Sheets in file:", wb.SheetNames);
    
    // Find DETALLE DE ACTA
    const sheetName = wb.SheetNames.find(s => s.trim().toUpperCase().includes('DETALLE'));
    if (sheetName) {
        console.log(`\nFound sheet: ${sheetName}`);
        const sheet = wb.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        for (let r=0; r<rows.length; r++) {
            const row = rows[r];
            if (!row) continue;
            // Let's print row where item is 2.01. The item column might be D (col 3)?
            for (let i = 0; i < row.length; i++) {
                if (String(row[i]).trim() === '2.01') {
                    console.log(`Found 2.01 at row ${r}, col ${i}`);
                    for (let j = 0; j < Math.max(row.length, 12); j++) {
                         console.log(`  Col ${j}: ${row[j]}`);
                    }
                }
            }
        }
    } else {
        console.log("No sheet with DETALLE found.");
    }
}
main();
