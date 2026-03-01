
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: groups } = await supabase.from('groups').select('*');
    console.log('--- ALL GROUPS ---');
    groups.forEach(g => {
        console.log(`G: [${g.title}] B_ID: [${g.board_id}]`);
    });
}

check();
