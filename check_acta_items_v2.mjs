
import { createClient } from '@supabase/supabase-client';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
    const { data: items } = await supabase.from('items').select('name');
    const actaItems = items.filter(i => i.name.toUpperCase().includes('ACTA'));
    console.log('Items containing "ACTA":', actaItems.length);
    if (actaItems.length > 0) {
        console.log(actaItems.map(i => i.name));
    }
}
check();
