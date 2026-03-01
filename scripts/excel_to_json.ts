
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'ACTIVIDADES-ACTA.xlsx');
const outputPath = path.join(process.cwd(), 'src/data/budget_seed.json');

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const dataRows = rows.slice(1);
const budgetItems = [];

for (const row of dataRows) {
    const code = row[0] ? String(row[0]).trim() : '';
    const desc = row[1] ? String(row[1]).trim() : '';
    const unit = row[2] ? String(row[2]).trim() : 'UND';
    const cant = parseFloat(row[3]) || 1;
    const unit_price = parseFloat(row[4]) || 0;

    if (!desc) continue;

    budgetItems.push({
        code,
        name: `${code} ${desc}`,
        unit,
        cant,
        unit_price
    });
}

fs.writeFileSync(outputPath, JSON.stringify(budgetItems, null, 2));
console.log(`Saved ${budgetItems.length} items to ${outputPath}`);
