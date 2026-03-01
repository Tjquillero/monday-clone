import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Broad search in items table...");
    const { data: items } = await supabase.from('items').select('id, name');
    
    const matches = items?.filter(i => {
        const n = String(i.name || '').toLowerCase();
        return n.includes('general') || n.includes('nomina') || n.includes('nómina');
    });
    
    console.log(`Found ${matches?.length || 0} matches.`);
    matches?.forEach(m => console.log(`[${m.id}] ${m.name}`));
}

main().catch(console.error);
