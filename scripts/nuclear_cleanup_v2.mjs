import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("NUCLEAR CLEANUP STARTING...");
    
    const targets = [
        'NÓMINA - GENERAL',
        'NOMINA - GENERAL',
        'INSUMOS - GENERAL',
        'TRANSPORTE - GENERAL',
        'CAJA MENOR - GENERAL',
        'ADMINISTRACIÓN - GENERAL',
        'UTILIDAD - GENERAL',
        'IMPUESTOS - GENERAL'
    ];
    
    for (const name of targets) {
        console.log(`Deleting ${name}...`);
        const { error: d1 } = await supabase.from('items').delete().ilike('name', `%${name}%`);
        if (d1) console.error(`Error deleting ${name} from items:`, d1);
        
        // Also check if they are in financial_acta_details as items (they shouldn't be names there, so skipping)
    }
    
    // Check for items in the group PRESUPUESTO GENERAL that might be duplicates
    console.log("Checking for items in PRESUPUESTO GENERAL...");
    const { data: items } = await supabase.from('items').select('id, name, group_id, groups(title)');
    
    const toDelete = items?.filter(i => {
        const n = (i.name || '').toUpperCase();
        return n.includes('NOMINA') || n.includes('NÓMINA') || n.includes('- GENERAL');
    });
    
    console.log(`Found ${toDelete?.length || 0} items to delete.`);
    for (const item of toDelete || []) {
        console.log(`Deleting: [${item.name}] (ID: ${item.id})`);
        await supabase.from('items').delete().eq('id', item.id);
    }
    
    console.log("NUCLEAR CLEANUP FINISHED.");
}

main().catch(console.error);
