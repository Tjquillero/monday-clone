import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Auditing financial_items...");
    const { data: items, error } = await supabase.from('financial_items').select('*');
    if (error) {
        console.error(error);
        return;
    }
    
    console.log(`Found ${items?.length || 0} financial items.`);
    
    const matches = items?.filter(i => {
        const n = (i.name || '').toUpperCase();
        return n.includes('GENERAL') || n.includes('NOMINA') || n.includes('NÓMINA');
    });
    
    console.log(`Matches: ${matches?.length || 0}`);
    matches?.forEach(m => console.log(`- [${m.id}] ${m.name}`));
    
    fs.writeFileSync('financial_items_audit.txt', items.map(i => `${i.id}|${i.name}`).join('\n'));
}

main().catch(console.error);
