import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: items } = await supabase.from('items').select('id, name, group_id, groups(title)');
    
    const results = items?.filter(i => {
        const n = (i.name || '').toUpperCase();
        const g = (i.groups?.title || '').toUpperCase();
        return n.includes('GENERAL') || n.includes('NOMINA') || n.includes('NÓMINA') || g.includes('GENERAL');
    });

    console.log(`Found ${results?.length || 0} potential items.`);
    
    const output = results?.map(r => `[${r.id}] Name: ${r.name} | Group: ${r.groups?.title}`).join('\n');
    fs.writeFileSync('problematic_items_detailed.txt', output || 'None found.');
}

main().catch(console.error);
