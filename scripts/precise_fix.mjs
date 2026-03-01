
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    const groupId = '98153f4c-18b9-4bf1-b220-43a05be464a7'; // Plaza Puerto Colombia ID from census (partial)
    // Actually I'll search by title
    const { data: plaza } = await supabase.from('groups').select('board_id').ilike('title', '%plaza%').single();
    if (!plaza) { console.log('Plaza not found'); return; }
    
    const boardId = plaza.board_id;
    console.log(`Board with Plaza: ${boardId}`);

    // Check if Manglares exists there
    const { data: m } = await supabase.from('groups').select('*').eq('board_id', boardId).ilike('title', 'MANGLARES');
    if (m && m.length > 0) {
      console.log('MANGLARES already exists on this board.');
    } else {
      console.log('Adding MANGLARES to Plaza board...');
      const { data: all } = await supabase.from('groups').select('id').eq('board_id', boardId);
      await supabase.from('groups').insert({
          board_id: boardId,
          title: 'MANGLARES',
          color: '#10b981',
          position: (all?.length || 0) + 1
      });
    }
}

fix();
