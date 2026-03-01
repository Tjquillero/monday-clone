const XLSX = require('xlsx');

function readExcelBottom() {
    console.log("Reading excel...");
    const workbook = XLSX.readFile('YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb');
    const sheetName = 'OPERACION';
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        console.log("Sheet not found.");
        return;
    }

    const range = XLSX.utils.decode_range(sheet['!ref']);
    console.log(`Range: Row ${range.s.r} to ${range.e.r}`);

    // Print the last 40 rows, looking for formulas.
    const startRow = Math.max(0, range.e.r - 40);
    
    for (let R = startRow; R <= range.e.r; ++R) {
        let rowText = [];
        let hasData = false;
        for (let C = 0; C <= 10; ++C) {
            const cellAddress = {c:C, r:R};
            const cellRef = XLSX.utils.encode_cell(cellAddress);
            const cell = sheet[cellRef];
            if (cell) {
                hasData = true;
                let val = cell.v;
                if (cell.f) {
                   val = `[FORMULA: ${cell.f} | VAL: ${cell.v}]`;
                }
                rowText.push(val);
            } else {
                rowText.push("");
            }
        }
        if (hasData) {
            console.log(`Row ${R+1}:`, rowText.join(' | '));
        }
    }
}

readExcelBottom();
