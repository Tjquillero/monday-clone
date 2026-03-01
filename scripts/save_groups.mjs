import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: groups } = await supabase.from('groups').select('title, board_id');
    const content = groups.map(g => `[${g.title}] (Board: ${g.board_id})`).join('\n');
    fs.writeFileSync('groups_list.txt', content);
    console.log(`Saved ${groups.length} groups.`);
}

main().catch(console.error);
