
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: plaza } = await supabase.from('groups').select('*').ilike('title', 'Plaza Puerto Colombia').single();
    console.log('Plaza Group Details:', plaza);
    
    if (plaza) {
      const { data: board } = await supabase.from('boards').select('*').eq('id', plaza.board_id);
      console.log('Board of Plaza:', board);
    }
}

check();
