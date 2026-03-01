
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: g } = await supabase.from('groups').select('board_id, title').ilike('title', 'Plaza Puerto Colombia').single();
    console.log('Plaza Board ID:', g.board_id);
    
    const { data: b } = await supabase.from('boards').select('*').eq('id', g.board_id);
    console.log('Board found for it:', b);
}

check();
