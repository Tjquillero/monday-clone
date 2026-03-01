
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: counts } = await supabase.from('items').select('board_id', { count: 'exact', head: true });
    console.log('Total items in DB:', counts);
    
    const { data: perBoard } = await supabase.from('items').select('board_id');
    const tally = {};
    perBoard?.forEach(i => {
        tally[i.board_id] = (tally[i.board_id] || 0) + 1;
    });
    console.log('Items per board:', tally);
}

check();
