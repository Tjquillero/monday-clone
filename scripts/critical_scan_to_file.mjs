import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: items } = await supabase.from('items').select('*, groups(title)');
    const matches = items?.filter(i => {
        const n = (i.name || '').toUpperCase();
        const g = (i.groups?.title || '').toUpperCase();
        const v = JSON.stringify(i.values || {}).toUpperCase();
        
        return n.includes('GENERAL') || n.includes('NOMINA') || n.includes('NÓMINA') ||
               g.includes('GENERAL') || g.includes('NOMINA') ||
               v.includes('GENERAL') || v.includes('NOMINA');
    });

    let output = `Found ${matches?.length || 0} potential matches.\n\n`;
    matches?.forEach(m => {
        output += `- [${m.name}] | Group: ${m.groups?.title} | ID: ${m.id}\n`;
    });
    
    fs.writeFileSync('critical_scan_report.txt', output);
    console.log("Scan report saved.");
}

main().catch(console.error);
