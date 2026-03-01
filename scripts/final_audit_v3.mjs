
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log('--- BOARDS ---');
    boards.forEach(b => console.log(`B: [${b.name}] (ID: ${b.id})`));

    const { data: groups } = await supabase.from('groups').select('*');
    console.log('\n--- GROUPS ---');
    groups.forEach(g => {
        const board = boards.find(b => b.id === g.board_id);
        console.log(`G: [${g.title}] | B: [${board?.name || 'N/A'}] (PID: ${g.board_id}) | ID: ${g.id}`);
    });
}

check();
