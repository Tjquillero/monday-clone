
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: b } = await s.from('boards').select('*').limit(1);
    console.log(`FULL_BOARD_ID: ${b[0].id}`);
    const { data: g } = await s.from('groups').select('*').eq('board_id', b[0].id);
    console.log(`GROUPS: ${g.map(x => x.title).join(', ')}`);
}
run();
