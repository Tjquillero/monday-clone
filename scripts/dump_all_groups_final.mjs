
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function dump() {
    const { data: groups } = await supabase.from('groups').select('*');
    console.log('GROUPS_DUMP:', JSON.stringify(groups, null, 2));
}

dump();
