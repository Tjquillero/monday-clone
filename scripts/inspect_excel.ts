
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'ACTIVIDADES-ACTA.xlsx');

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert to JSON to see the structure
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log(`Sheet Name: ${sheetName}`);
console.log('First 5 rows:');
data.slice(0, 10).forEach((row, index) => {
    console.log(`Row ${index}:`, JSON.stringify(row));
});
