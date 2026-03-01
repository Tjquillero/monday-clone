import xlsx from 'xlsx';
import fs from 'fs';

function main() {
    const out = {};
    const wb1 = xlsx.readFile('POA 2026 V.02 Ene.26-2026.xlsx');
    const rows1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1 });
    
    out.poa = {};
    for(let r=0; r<rows1.length; r++) {
        const row = rows1[r];
        if(!row) continue;
        const code = String(row[1] || '').trim();
        if(code === '2.01' || code === '2.02') {
             out.poa[code] = { 
                 col5_2025: row[5], 
                 col6_2026: row[6] 
             };
        }
    }

    const wb2 = xlsx.readFile('Acta 32 ene-26.xlsx');
    const rows2 = xlsx.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 });
    out.acta32 = {};
    for(let r=0; r<rows2.length; r++) {
        const row = rows2[r];
        if(!row) continue;
        const code = String(row[0] || '').trim();
        if(code === '2.01' || code === '2.02') {
             out.acta32[code] = {
                 col3_cant: row[3],
                 col4_vunit: row[4]
             };
        }
    }
    
    fs.writeFileSync('compare_json.json', JSON.stringify(out, null, 2), 'utf8');
}
main();
