import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: groups, error } = await supabase
        .from('groups')
        .select('id, title, color')
        .order('title');
        
    if (error) {
         console.error(error);
         return;
    }
    
    console.log("Current Groups:");
    for (const g of groups) {
        console.log(`Title: ${g.title.padEnd(60)} | Color: ${g.color} | ID: ${g.id}`);
    }
}
main().catch(console.error);
