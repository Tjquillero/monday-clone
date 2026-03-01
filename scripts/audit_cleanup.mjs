import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Full DB Item Audit...");
    
    const { data: items, error } = await supabase
        .from('items')
        .select('id, name, group_id');

    if (error) {
        console.error(error);
        return;
    }

    console.log(`Total items in DB: ${items.length}`);
    
    const targets = items.filter(i => 
        i.name.toUpperCase().includes('GENERAL') || 
        i.name.toUpperCase().includes('NOMINA') ||
        i.name.toUpperCase().includes('NÓMINA')
    );

    console.log(`Found ${targets.length} items matching 'GENERAL' or 'NOMINA'`);
    targets.forEach(t => console.log(`- ID: ${t.id} | Name: [${t.name}] | Group: ${t.group_id}`));

    if (targets.length > 0) {
        const { error: delError } = await supabase
            .from('items')
            .delete()
            .in('id', targets.map(t => t.id));
        
        if (delError) console.error("Delete error:", delError);
        else console.log("Final cleanup successful.");
    }
}

main().catch(console.error);
