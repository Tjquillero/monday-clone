import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Universal search in items...");
    const { data: items } = await supabase.from('items').select('*');
    
    const results = items?.filter(item => {
        const str = JSON.stringify(item).toUpperCase();
        return str.includes('NOMINA') || str.includes('GENERAL');
    });

    console.log(`Found ${results?.length || 0} objects containing target terms.`);
    results?.forEach(r => {
        console.log(`- [${r.id}] Name: ${r.name}`);
    });
}

main().catch(console.error);
