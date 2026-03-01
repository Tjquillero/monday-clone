
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: groups } = await supabase.from('groups').select('id, title, board_id');
    const plaza = groups.find(g => g.title.toLowerCase().includes('plaza'));
    const manglares = groups.find(g => g.title.toLowerCase().includes('manglares'));

    console.log('Plaza:', plaza);
    console.log('Manglares:', manglares);
    
    if (plaza && manglares) {
        console.log('SAME BOARD?', plaza.board_id === manglares.board_id);
    }
}

check();
