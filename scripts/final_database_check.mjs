
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('*');
    for (const b of boards) {
      console.log(`BOARD: ${b.name} (${b.id})`);
      const { data: groups } = await supabase.from('groups').select('*').eq('board_id', b.id);
      console.log(` - Groups count: ${groups?.length}`);
      groups.forEach(g => console.log(`   - GRP: ${g.title}`));
    }
}

check();
