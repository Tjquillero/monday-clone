
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkManglares() {
    const { data: groups } = await supabase.from('groups').select('*').ilike('title', '%manglares%');
    console.log('Groups matching "Manglares":', groups);
    
    if (groups && groups.length > 0) {
        const { data: boards } = await supabase.from('boards').select('id, name').eq('id', groups[0].board_id);
        console.log('Board of Manglares:', boards);
    }
}

checkManglares();
