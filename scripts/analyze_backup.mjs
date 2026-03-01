import fs from 'fs';

async function main() {
    const backupItems = JSON.parse(fs.readFileSync('all_items_final.json', 'utf8'));
    console.log(`Total backup items: ${backupItems.length}`);
    
    const generalItems = backupItems.filter(i => 
        i.name.includes('GENERAL') || 
        i.name.includes('NÓMINA') ||
        i.name.includes('INSUMOS')
    );

    console.log(`Potential general items in backup: ${generalItems.length}`);
    generalItems.slice(0, 20).forEach(i => console.log(`- [${i.name}] (Code: ${i.values?.code})`));
}

main().catch(console.error);
