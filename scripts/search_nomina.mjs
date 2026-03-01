import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: items } = await supabase
        .from('items')
        .select('*, groups(title)')
        .ilike('name', '%NÓMINA%');
    
    console.log(`Found ${items?.length || 0} items with 'NÓMINA' in name`);
    items?.forEach(i => {
        console.log(`- [${i.name}] (ID: ${i.id}, Group: ${i.groups?.title})`);
    });
}

main().catch(console.error);
