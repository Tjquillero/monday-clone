
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: g } = await supabase.from('groups').select('*').ilike('title', '%Plaza%');
    console.log('Plaza group in DB:', g);
    
    const { data: all_g } = await supabase.from('groups').select('title');
    console.log('Final All Group Titles:', all_g.map(x => x.title));
}

check();
