import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking for items with code 4.1, 4.2, 4.10, 4.20...");
    
    // We get items starting with 4.
    const { data: items, error } = await supabase
        .from('items')
        .select('id, name, values')
        .ilike('name', '4.%');
        
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
        
        if (code === '4.1' || i.name.startsWith('4.1 ')) {
            toUpdate.push({ id: i.id, oldCode: code, newCode: '4.10', name: i.name });
        }
        if (code === '4.2' || i.name.startsWith('4.2 ')) {
            toUpdate.push({ id: i.id, oldCode: code, newCode: '4.20', name: i.name });
        }
    }
    
    for (const u of toUpdate) {
        let newName = u.name.replace(/^4\.[12]\s*/, `${u.newCode} `);
        console.log(`Updating ID: ${u.id} | ${u.name} -> ${newName} | Code: ${u.newCode}`);
        
        // Fetch current values
        const { data: item } = await supabase.from('items').select('values').eq('id', u.id).single();
        let newValues = { ...item.values, code: u.newCode };
        
        const { error: updErr } = await supabase.from('items').update({
             name: newName,
             values: newValues
        }).eq('id', u.id);
        
        if (updErr) console.error("Error updating:", updErr);
        else console.log("Success.");
    }
}
main().catch(console.error);
