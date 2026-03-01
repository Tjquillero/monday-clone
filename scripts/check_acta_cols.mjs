import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data, error } = await supabase.from('financial_acta_details').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    console.log("COLUMNS:", Object.keys(data[0] || {}));
}

main().catch(console.error);
