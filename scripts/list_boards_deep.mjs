import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log(`Checking ${boards.length} boards...`);
    
    for (const board of boards) {
        console.log(`Board: ${board.name} (${board.id})`);
        const { data: groups } = await supabase.from('groups').select('id, title').eq('board_id', board.id);
        console.log(`  Groups: ${groups?.length || 0}`);
        for (const g of groups || []) {
            const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', g.id);
            console.log(`    - Group: [${g.title}] (ID: ${g.id}) | Items: ${count}`);
        }
    }
}

main().catch(console.error);
