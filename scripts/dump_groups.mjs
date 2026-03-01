import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: groups } = await supabase.from('groups').select('title, board_id');
    console.log(`Total groups: ${groups?.length || 0}`);
    groups?.forEach(g => console.log(`- [${g.title}] (Board: ${g.board_id})`));
}

main().catch(console.error);
