
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: g } = await supabase.from('groups').select('*').ilike('title', 'MANGLARES');
    for (const group of g) {
        const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', group.id);
        console.log(`G:[${group.title}] ID:[${group.id}] BOARD:[${group.board_id}] ITEM_COUNT:${count}`);
        if (count > 0) {
            const { data: i } = await supabase.from('items').select('*').eq('group_id', group.id).limit(1);
            console.log(`  Sample: ${i[0].name} | item_type: ${i[0].values?.item_type}`);
        }
    }
}

check();
