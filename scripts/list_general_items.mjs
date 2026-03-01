import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: group } = await supabase.from('groups').select('*').eq('title', 'PRESUPUESTO GENERAL').single();
    if (!group) {
        console.log("Group not found");
        return;
    }
    console.log(`Checking items in group: ${group.title} (${group.id})`);
    const { data: items } = await supabase.from('items').select('name').eq('group_id', group.id);
    console.log(`Found ${items?.length || 0} items.`);
    
    const matches = items?.filter(i => 
        i.name.includes('GENERAL') || 
        i.name.includes('NÓMINA') || 
        i.name.includes('INSUMOS')
    );
    
    console.log(`Matches (${matches?.length || 0}):`);
    matches?.slice(0, 20).forEach(i => console.log(`- ${i.name}`));
}

main().catch(console.error);
