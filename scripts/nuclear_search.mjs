import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for specific names...");
    const targetNames = [
        'NÓMINA - GENERAL',
        'NOMINA - GENERAL',
        'INSUMOS - GENERAL',
        'TRANSPORTE - GENERAL',
        'CAJA MENOR - GENERAL',
        'ADMINISTRACIÓN - GENERAL',
        'UTILIDAD - GENERAL',
        'IMPUESTOS - GENERAL'
    ];
    
    for (const name of targetNames) {
        const { data, error } = await supabase.from('items').select('id, name').ilike('name', `%${name}%`);
        if (data && data.length > 0) {
            console.log(`FOUND: ${name} (${data.length} matches)`);
            data.forEach(d => console.log(`  - ID: ${d.id} | Name: ${d.name}`));
        }
    }
    
    console.log("Searching for fragments...");
    const { data: fragments } = await supabase.from('items').select('id, name').ilike('name', '%- GENERAL%');
    console.log(`Items with "- GENERAL": ${fragments?.length || 0}`);
    fragments?.forEach(d => console.log(`  - ID: ${d.id} | Name: ${d.name}`));
}

main().catch(console.error);
