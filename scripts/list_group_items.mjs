import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const targetGroups = ['1cb17fc5-8ff0-4822-83b8-6a5ba1daddcc', '41bdd7d8-f199-45da-b781-5a00e5ccde05'];

    for (const groupId of targetGroups) {
        // Fetch all items in this group
        const { data: siblings } = await supabase
            .from('items')
            .select('id, name, position')
            .eq('group_id', groupId)
            .order('position', { ascending: true });

        console.log(`\nGroup ${groupId} Items:`);
        for (const sib of siblings) {
            console.log(`Pos: ${sib.position} | Name: ${sib.name.substring(0, 50)}`);
        }
    }
}

main().catch(console.error);
