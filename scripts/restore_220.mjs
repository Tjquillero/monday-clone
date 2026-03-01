import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let start = 0;
    const limit = 1000;
    let allItems = [];
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values')
            .range(start, start + limit - 1);
            
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }

    let updatedCount = 0;
    const updates = [];
    
    for (const item of allItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim();
        let nameMatch = item.name.match(/^2\.2\s/);
        
        if (extractedCode === '2.2' || nameMatch) {
            let newValues = { ...item.values, code: '2.20' };
            let newName = item.name.replace(/^2\.2\s/, '2.20 ');
            
            updates.push(supabase.from('items').update({
                name: newName,
                values: newValues
            }).eq('id', item.id));
            
            console.log(`Fixing item ID ${item.id}: ${item.name.substring(0,30)} -> ${newName.substring(0,30)}`);
            updatedCount++;
        }
    }
    
    console.log(`Executing ${updates.length} updates to restore 2.20 zeros...`);
    for (let i = 0; i < updates.length; i += 20) {
        await Promise.all(updates.slice(i, i + 20));
    }
    console.log(`Finished restoring ${updatedCount} items.`);
}
main().catch(console.error);
