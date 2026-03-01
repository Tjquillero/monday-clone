import xlsx from 'xlsx';

function main() {
    console.log("Reading POA 2026 ...");
    const wb1 = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
    const rows1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1 });
    
    for(let r=0; r<rows1.length; r++) {
        const row = rows1[r];
        if(!row) continue;
        const code = String(row[1] || '').trim();
        if(code === '2.01' || code === '2.02') {
             console.log(`POA 2026 [${code}]: Vr. UNITARIO 2025: ${row[5]}, Vr. UNITARIO 2026: ${row[6]}`);
        }
    }

    console.log("\nReading Acta 32 ...");
    const wb2 = xlsx.readFile('Acta 32 ene-26.xlsx');
    const rows2 = xlsx.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 });
    
    for(let r=0; r<rows2.length; r++) {
        const row = rows2[r];
        if(!row) continue;
        const code = String(row[0] || '').trim();
        if(code === '2.01' || code === '2.02') {
             console.log(`Acta 32 [${code}]: V/UNIT: ${row[4]}`);
        }
    }
}
main();
