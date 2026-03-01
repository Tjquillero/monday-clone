import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const groupId = '41bdd7d8-f199-45da-b781-5a00e5ccde05';
    const { data: items } = await supabase.from('items').select('name, values').eq('group_id', groupId);
    
    console.log(`Group Items: ${items?.length || 0}`);
    items?.slice(0, 100).forEach(i => {
        console.log(`- ${i.name}`);
    });
}

main().catch(console.error);
