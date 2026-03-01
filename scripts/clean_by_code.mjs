import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for items with code '0.0.0.0'...");
    
    const { data: items } = await supabase.from('items').select('*');
    const matches = items?.filter(i => {
        const code = i.values?.code;
        return code === '0.0.0.0' || code === 0 || code === '0';
    });
    
    console.log(`Found ${matches?.length || 0} items with code 0.0.0.0`);
    matches?.forEach(i => console.log(`- [${i.name}] (Group ID: ${i.group_id})`));
    
    if (matches && matches.length > 0) {
        const ids = matches.map(i => i.id);
        const { error } = await supabase.from('items').delete().in('id', ids);
        if (error) console.error("Error deleting:", error);
        else console.log("Deleted successfully.");
    }
}

main().catch(console.error);
