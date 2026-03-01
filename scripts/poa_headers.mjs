import xlsx from 'xlsx';

function main() {
    const wb = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    
    console.log("ROW 0:", rows[0]);
    console.log("ROW 1:", rows[1]);
    console.log("ROW 2:", rows[2]);
    console.log("ROW 3:", rows[3]);
}
main();
