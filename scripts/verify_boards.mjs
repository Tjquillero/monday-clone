import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log("Boards in DB:");
    boards?.forEach(b => console.log(`- ID: ${b.id} | Name: [${b.name}]`));

    const { data: groups } = await supabase.from('groups').select('id, title, board_id');
    console.log("Groups in DB:");
    groups?.forEach(g => console.log(`- ID: ${g.id} | Title: [${g.title}] | Board: ${g.board_id}`));
}

main().catch(console.error);
