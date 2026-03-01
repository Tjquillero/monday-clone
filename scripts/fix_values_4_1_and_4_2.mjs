import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Fetching items with codes 4.10 and 4.20...");
    
    const { data: items, error } = await supabase
        .from('items')
        .select('id, name, values')
        .or('name.ilike.4.10 %,name.ilike.4.20 %');
        
    if (error) {
         console.error(error);
         return;
    }
    
    for (const i of items) {
        let currentCode = i.values?.code;
        let expectedCode = i.name.startsWith('4.10') ? '4.10' : '4.20';
        
        let newValues = { ...i.values, code: expectedCode };
        
        console.log(`Updating ID: ${i.id} | Name: ${i.name.substring(0,40)} | Set Code: ${expectedCode}`);
        
        const { error: updErr } = await supabase.from('items').update({
             values: newValues
        }).eq('id', i.id);
        
        if (updErr) console.error("Error updating:", updErr);
        else console.log("Success.");
    }
}
main().catch(console.error);
