
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkGroups() {
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    const { data: boards } = await supabase.from('boards').select('id, name');
    if (!boards || boards.length === 0) {
        console.log('No boards found');
        return;
    }
    const board = boards[0]; 
    console.log('Board:', board.name, board.id);

    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', board.id);
    console.log('Groups found:', groups.map(g => ({ id: g.id, title: g.title })));
}

checkGroups();
