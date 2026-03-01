import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Attempting direct update on group...");
    const { data, error, count } = await supabase
        .from('groups')
        .update({ color: '#fdab3d' })
        .eq('id', '41bdd7d8-f199-45da-b781-5a00e5ccde05')
        .select();

    console.log("Error:", error);
    console.log("Data updated:", data);
}
main().catch(console.error);
