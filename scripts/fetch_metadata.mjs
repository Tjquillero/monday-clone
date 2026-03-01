import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: actas } = await supabase.from('financial_actas').select('*');
    fs.writeFileSync('actas.json', JSON.stringify(actas, null, 2));

    const { data: groups } = await supabase.from('groups').select('*');
    fs.writeFileSync('groups.json', JSON.stringify(groups, null, 2));

    const { data: items } = await supabase.from('items').select('id, name, group_id, values');
    fs.writeFileSync('items.json', JSON.stringify(items, null, 2));
}

main().catch(console.error);
