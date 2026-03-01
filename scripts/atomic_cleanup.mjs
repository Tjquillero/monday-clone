import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for ALL groups named 'PRESUPUESTO GENERAL'...");
    
    const { data: groups } = await supabase.from('groups').select('*');
    const targetGroups = groups?.filter(g => g.title.toUpperCase().includes('PRESUPUESTO GENERAL'));
    
    console.log(`Found ${targetGroups?.length || 0} matching groups.`);
    
    for (const group of targetGroups || []) {
        console.log(`\nGroup: ${group.title} (${group.id})`);
        const { data: items } = await supabase.from('items').select('id, name').eq('group_id', group.id);
        
        console.log(`Items in group: ${items?.length || 0}`);
        
        // Target specifically the items from the user's screenshot
        const toDelete = items?.filter(i => {
            const n = i.name.toUpperCase();
            return n.includes('NÓMINA - GENERAL') || 
                   n.includes('INSUMOS - GENERAL') || 
                   n.includes('TRANSPORTE - GENERAL') || 
                   n.includes('FIJO - GENERAL') || 
                   n.includes('CAJA MENOR - GENERAL') ||
                   n === 'GENERAL' ||
                   n === 'PRESUPUESTO GENERAL';
        });

        console.log(`Found ${toDelete?.length || 0} items to delete.`);
        
        if (toDelete && toDelete.length > 0) {
            const ids = toDelete.map(i => i.id);
            const { error: delError } = await supabase.from('items').delete().in('id', ids);
            if (delError) console.error("Error deleting items:", delError);
            else console.log(`Successfully deleted ${toDelete.length} items.`);
        }
    }
}

main().catch(console.error);
