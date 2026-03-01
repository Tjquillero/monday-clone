import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("FETCHING EVERY SINGLE ITEM IN THE DB...");
    const { data: items, error } = await supabase.from('items').select('name, group_id');
    if (error) {
        console.error(error);
        return;
    }
    console.log(`Total items found: ${items.length}`);
    
    const nominaItems = items.filter(i => i.name.toUpperCase().includes('NÓMINA') || i.name.toUpperCase().includes('NOMINA'));
    console.log(`Items with NOMINA (${nominaItems.length}):`);
    nominaItems.forEach(i => console.log(`- ${i.name} (Group: ${i.group_id})`));
}

main().catch(console.error);
