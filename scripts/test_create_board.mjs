import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data, error } = await supabase.from('boards').insert({
        name: 'Test Board'
    }).select();

    if (error) {
        console.error("ERROR_START");
        console.error(JSON.stringify(error, null, 2));
        console.error("ERROR_END");
    } else {
        console.log("SUCCESS:", data);
    }
}

main().catch(console.error);
