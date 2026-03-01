import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: item, error } = await supabase
        .from('items')
        .select('*')
        .limit(1)
        .single();
        
    if (error) {
        console.error("Supabase Error:", error);
        return;
    }
    fs.writeFileSync('schema.json', JSON.stringify(item, null, 2));
}
main().catch(console.error);
