import xlsx from 'xlsx';

const wb = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];

// Get data as an array of arrays
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// The header row is likely row index 1 or 2. Let's find it by looking for common column names.
let headerRowIndex = -1;
for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('descrip'))) {
        headerRowIndex = i;
        break;
    }
}

if (headerRowIndex !== -1) {
    console.log("Headers:");
    console.log(rows[headerRowIndex].slice(0, 10)); // print first 10 columns
    console.log("First data row:");
    console.log(rows[headerRowIndex + 1].slice(0, 10));
} else {
    // just print top rows
    for (let i=0; i<5; i++) {
        console.log(`row ${i}:`, rows[i]?.slice(0, 10));
    }
}
