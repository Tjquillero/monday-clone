
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items } = await supabase.from('items').select('board_id, name').limit(10);
    if (items) console.log('Sample Items board IDs:', items.map(i => i.board_id));
    else console.log('No items found.');
    
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log('All Boards:', boards);
}

check();
