
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: groups } = await supabase.from('groups').select('*').ilike('title', '%plaza%');
    console.log('Plaza groups found:', groups.length);
    groups.forEach(g => {
        console.log(`GRP: ${g.title} BOARD: ${g.board_id}`);
    });
}

check();
