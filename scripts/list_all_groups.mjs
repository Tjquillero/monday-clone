
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkGroups() {
    const { data: groups } = await supabase.from('groups').select('id, title, board_id');
    console.log('All Groups found:', JSON.stringify(groups, null, 2));
}

checkGroups();
