import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let out = {};
    const { data: group, error: e1 } = await supabase.from('groups').select('*').limit(1);
    out.groups_data = group;
    out.groups_error = e1;
    
    const { data: board, error: e2 } = await supabase.from('boards').select('*').limit(1);
    out.boards_data = board;
    out.boards_error = e2;

    fs.writeFileSync('schema_relations.json', JSON.stringify(out, null, 2));
}
main().catch(console.error);
