import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Restoring default financial items if missing...");
    
    // Get a group to attach them to
    const { data: groups, error: gErr } = await supabase.from('groups').select('id').limit(1);
    if (gErr || !groups || groups.length === 0) {
        console.error("Could not find a group to attach items to.");
        return;
    }
    const targetGroupId = groups[0].id;

    const rubros = ['Nómina', 'Insumos', 'Transporte', 'Fijo', 'Caja Menor'];
    
    for (const rubro of rubros) {
        const { data: existing } = await supabase
            .from('items')
            .select('id')
            .filter('values->>rubro', 'eq', rubro);
            
        if (!existing || existing.length === 0) {
            console.log(`Restoring missing group: ${rubro}`);
            const { error } = await supabase.from('items').insert({
                group_id: targetGroupId,
                name: `${rubro} - General`,
                position: 999,
                values: {
                    rubro: rubro,
                    category: 'General',
                    unit: 'Gl',
                    cant: 1,
                    unit_price: 0,
                    item_type: 'financial'
                }
            });
            if (error) console.error("Error inserting:", error);
        } else {
            console.log(`${rubro} already exists.`);
        }
    }
    console.log("Done restoring.");
}
main().catch(console.error);
