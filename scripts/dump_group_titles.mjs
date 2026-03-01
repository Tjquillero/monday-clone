import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let out = "";
    const log = (msg) => { out += msg + '\n'; console.log(msg); };
    
    const { data: groups, error } = await supabase
        .from('groups')
        .select('id, title, color')
        .order('title');
        
    for (const g of groups) {
         log(g.title);
    }
    fs.writeFileSync('groups_out.txt', out);
}
main().catch(console.error);
