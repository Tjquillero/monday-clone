import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let allItems = [];
    let start = 0;
    const limit = 1000;
    
    while (true) {
        const { data: items, error } = await supabase
            .from('items')
            .select('id, name, values')
            .range(start, start + limit - 1);
            
        if (error) break;
        if (!items || items.length === 0) break;
        allItems = allItems.concat(items);
        start += limit;
    }

    let updatedCount = 0;
    const updates = [];
    
    for (const item of allItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        let isMatch = false;
        
        // If the code is exactly '2.2', or the name starts with '2.2 '
        if (extractedCode === '2.2') {
            isMatch = true;
        } else if (!extractedCode && item.name.startsWith('2.2 ')) {
            isMatch = true;
        }

        if (isMatch) {
            let newValues = { ...item.values };
            let newName = item.name;
            
            newValues.code = '2.20';
            newName = newName.replace(/^2\.2(\s+)/, '2.20$1'); // Replace leading '2.2 ' with '2.20 '
            
            // Just to be sure, check if it's actually 2.21 or 2.22 mistyped, but we filtered for exactly '2.2 ' or '2.2' code
            
            updates.push(supabase.from('items').update({ name: newName, values: newValues }).eq('id', item.id));
            console.log(`Fixing: ${item.name.substring(0, 30)} -> ${newName.substring(0, 30)}`);
            updatedCount++;
        }
    }
    
    console.log(`Found ${updatedCount} items to fix for 2.20.`);
    for (let i = 0; i < updates.length; i += 20) {
        await Promise.all(updates.slice(i, i + 20));
    }
    console.log(`Finished executing updates.`);
}

main().catch(console.error);
