import fs from 'fs';
const content = fs.readFileSync('full_items_dump.txt', 'utf8');
const lines = content.split('\n');
const matches = lines.filter(l => l.toUpperCase().includes('NOMINA') || l.toUpperCase().includes('GENERAL'));
console.log(`Found ${matches.length} matches.`);
matches.forEach(m => console.log(m));
