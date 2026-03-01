import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: functions, error } = await supabase.rpc('get_functions'); // Standard if exists
    if (error) console.log("get_functions RPC not found");
    else console.log("Functions:", functions);
}

main().catch(console.error);
