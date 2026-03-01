import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const groupId = '41bdd7d8-f199-45da-b781-5a00e5ccde05';
    const { data: group, error } = await supabase.from('groups').select('*').eq('id', groupId).single();
    if (error) {
        console.error("Group fetch error:", error);
    } else {
        console.log("Group found:", group);
    }
}

main().catch(console.error);
