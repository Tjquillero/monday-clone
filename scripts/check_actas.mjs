import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: actas } = await supabase.from('financial_actas').select('*');
    console.log(`Actas: ${actas?.length}`);
    actas?.forEach(a => console.log(`- [${a.id}] Acta N ${a.consecutive || a.name || '?'}`));

    const { data: details } = await supabase.from('financial_acta_details').select('*');
    console.log(`\nActa details total: ${details?.length}`);
    
    // Check how many belong to each acta
    const byActa = {};
    for (const d of details || []) {
        byActa[d.acta_id] = (byActa[d.acta_id] || 0) + 1;
    }
    console.log('Details per acta:', byActa);
}

main().catch(console.error);
