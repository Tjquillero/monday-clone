import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
    console.log(`Auditing Board: ${boardId}`);
    
    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', boardId);
    
    for (const group of groups || []) {
        const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', group.id);
        console.log(`Group: [${group.title}] (ID: ${group.id}) - Items: ${count}`);
        
        if (count > 0 && count < 20) {
            const { data: sampleItems } = await supabase.from('items').select('name').eq('group_id', group.id);
            sampleItems?.forEach(i => console.log(`  - ${i.name}`));
        }
    }
}

main().catch(console.error);
