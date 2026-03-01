import xlsx from 'xlsx';

function main() {
    const wb = xlsx.readFile('Acta 32 ene-26.xlsx');
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    
    for(let r=0; r<rows.length; r++) {
        const row = rows[r];
        if(!row) continue;
        const code = String(row[0] || '').trim();
        if(code === '2.01' || code === '2.02') {
             console.log(`\n============ ITEM ${code} in Acta 32 ============`);
             console.log(`Col 0 ITEM:`, row[0]);
             console.log(`Col 1 DESC:`, row[1]);
             console.log(`Col 2 UNID:`, row[2]);
             console.log(`Col 3 CANT:`, row[3]);
             console.log(`Col 4 V/UNIT:`, row[4]);
             console.log(`Col 5 V/TOTAL:`, row[5]);
             console.log(`Col 6 CANT (Ant):`, row[6]);
             console.log(`Col 7 V/TOTAL:`, row[7]);
             console.log(`Col 8 CANT (Acta):`, row[8]);
             console.log(`Col 9 V/TOTAL:`, row[9]);
        }
    }
}
main();
