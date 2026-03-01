import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: groups, error } = await supabase.from('groups').select('id, title, color');
    if (error) console.error(error);
    else {
        console.log("Groups found:");
        groups.forEach(g => console.log(`- [${g.title}] Color: ${g.color} ID: ${g.id}`));
    }
}

main().catch(console.error);
