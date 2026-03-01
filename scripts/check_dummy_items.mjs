
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items } = await supabase.from('items').select('*, groups(title)').ilike('name', '%INICIO DE PROYECTO%');
    console.log('Dummy Items:', JSON.stringify(items, null, 2));
}

check();
