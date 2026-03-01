import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Fetching specific group...");
    const { data: group, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', '41bdd7d8-f199-45da-b781-5a00e5ccde05')
        .single();
        
    console.log(error ? error : group);
    
    console.log("Fetching all groups without order:");
    const { data: allGroups, error: err2 } = await supabase
        .from('groups')
        .select('*');
        
    fs.writeFileSync('all_groups.json', JSON.stringify(err2 ? err2 : allGroups, null, 2));
}
main().catch(console.error);
