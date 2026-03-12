
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('*').order('created_at', { ascending: false });
    for (const b of boards) {
        const { data: groups } = await supabase.from('groups').select('*').eq('board_id', b.id);
        console.log(`Board [${b.name}] (ID:${b.id}):`, groups.map(g => g.title));
    }
}

check();
