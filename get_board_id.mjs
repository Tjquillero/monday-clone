
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('boards').select('*').limit(1).then(({data:b}) => {
    const board = b[0];
    console.log(`Board ID: ${board.id} Name: ${board.name}`);
    s.from('groups').select('*').eq('board_id', board.id).then(({data:g}) => {
        console.log('Groups:', g.map(x => x.title));
    });
});
