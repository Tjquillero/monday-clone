
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkGroups() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log('Boards:', boards);
    
    for (const board of boards) {
        const { data: groups } = await supabase.from('groups').select('*, items(*)').eq('board_id', board.id).order('position');
        console.log(`\nBoard: ${board.name} (${board.id})`);
        console.log('Groups Count:', groups?.length);
        console.log('Groups titles:', groups?.map(g => g.title));
        
        groups?.forEach(g => {
            console.log(`- Group "${g.title}": ${g.items.length} items`);
        });
    }
}

checkGroups();
