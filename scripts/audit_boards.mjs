import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("BOARD AND GROUP AUDIT");
    
    const { data: boards } = await supabase.from('boards').select('*');
    console.log(`\nFound ${boards?.length || 0} boards.`);
    
    for (const board of boards || []) {
        console.log(`\nBoard: ${board.name} (${board.id})`);
        const { data: groups } = await supabase.from('groups').select('*').eq('board_id', board.id);
        console.log(`  - Groups: ${groups?.length || 0}`);
        for (const group of groups || []) {
            const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', group.id);
            console.log(`    * [${group.title}] (ID: ${group.id}) - Items: ${count}`);
            
            if (group.title.toUpperCase().includes('GENERAL')) {
                const { data: sampleItems } = await supabase.from('items').select('name').eq('group_id', group.id).limit(5);
                sampleItems?.forEach(i => console.log(`      > ${i.name}`));
            }
        }
    }
}

main().catch(console.error);
