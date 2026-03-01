import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Fetching items with code 5.4...");
    
    const { data: items, error } = await supabase
        .from('items')
        .select('id, name, values')
        .ilike('name', '5.4 %');
        
    if (error) {
         console.error(error);
         return;
    }
    
    let toUpdate = [];
    for (const i of items) {
        let code = String(i.values?.code || '').trim();
        if (!code) {
           const match = i.name.match(/^(\d+(?:\.\d+)*)/);
           if (match) code = match[1];
        }
        
        if (code === '5.4' || i.name.startsWith('5.4 ')) {
            toUpdate.push({ id: i.id, oldCode: code, newCode: '5.40', name: i.name, values: i.values });
        }
    }
    
    for (const u of toUpdate) {
        let newName = u.name.replace(/^5\.4\s*/, `${u.newCode} `);
        console.log(`Updating ID: ${u.id} | ${u.name} -> ${newName} | Code: ${u.newCode}`);
        
        let newValues = { ...u.values, code: u.newCode };
        
        const { error: updErr } = await supabase.from('items').update({
             name: newName,
             values: newValues
        }).eq('id', u.id);
        
        if (updErr) console.error("Error updating:", updErr);
        else console.log("Success.");
    }
}
main().catch(console.error);
