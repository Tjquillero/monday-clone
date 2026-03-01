const xlsx = require('xlsx');
const fs = require('fs');

try {
    const workbook = xlsx.readFile('YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb');
    let output = 'Sheet Names:\n' + workbook.SheetNames.join(', ') + '\n\n';

    for (const sheetName of workbook.SheetNames) {
        if (sheetName.toLowerCase().includes('sabana') || sheetName.toLowerCase().includes('resumen') || sheetName.toLowerCase().includes('matriz')) {
            output += `--- SHEET: ${sheetName} ---\n`;
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: false });
            // take first 50 rows
            data.slice(0, 50).forEach(row => {
               output += row.join(' | ') + '\n';
            });
            output += '\n\n';
        }
    }

    // Also just read the front sheet maybe
    const firstSheet = workbook.SheetNames[0];
    output += `--- First Sheet (${firstSheet}) Preview ---\n`;
    const dataFirst = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, range: 0, raw: false });
    dataFirst.slice(0, 30).forEach(row => {
        output += row.join(' | ') + '\n';
    });
    
    fs.writeFileSync('excel_preview.txt', output);
    console.log('Saved to excel_preview.txt');
} catch (e) {
    console.error(e);
}
