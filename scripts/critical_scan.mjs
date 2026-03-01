import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("CRITICAL SCAN: Searching for problematic items...");
    
    const { data: items } = await supabase.from('items').select('*, groups(title)');
    
    const matches = items?.filter(i => {
        const n = (i.name || '').toUpperCase();
        const g = (i.groups?.title || '').toUpperCase();
        const v = JSON.stringify(i.values || {}).toUpperCase();
        
        return n.includes('GENERAL') || n.includes('NOMINA') || n.includes('NÓMINA') ||
               g.includes('GENERAL') || g.includes('NOMINA') ||
               v.includes('GENERAL') || v.includes('NOMINA');
    });

    console.log(`Found ${matches?.length || 0} potential matches.`);
    
    matches?.slice(0, 50).forEach(m => {
        console.log(`- [${m.name}] | Group: ${m.groups?.title} | ID: ${m.id}`);
    });
}

main().catch(console.error);
