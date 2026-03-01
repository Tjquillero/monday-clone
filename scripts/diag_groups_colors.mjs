import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Fetching all groups to check their titles and colors...");
    const { data: groups, error } = await supabase
        .from('groups')
        .select('id, title, color')
        .order('title');
        
    if (error) {
        console.error("Error:", error);
        return;
    }
    
    console.log(`Found ${groups.length} groups:`);
    for (const g of groups) {
        console.log(`Title: "${g.title}" | Color: ${g.color}`);
    }
}
main().catch(console.error);
