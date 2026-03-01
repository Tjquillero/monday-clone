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
        
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        
        // Match conditions indicating it's the 2.20 item, mistakenly labeled 2.2
        let textMatch = item.name.includes('PODA TECNICA Y FORMATIVA') || item.name.includes('PODA TÉCNICA');
        let codeMatch = extractedCode === '2.2' || extractedCode === '2.20';
        let startsWithMatch = item.name.startsWith('2.2 ') || item.name.startsWith('2.20 ');

        if (textMatch || startsWithMatch || extractedCode === '2.2') {
            console.log(`Matching Item: ${item.name.substring(0, 50)} | Code: ${item.values.code}`);
            
            let newValues = { ...item.values };
            let newName = item.name;
            let needsUpdate = false;
            
            if (newValues.code === '2.2') {
                newValues.code = '2.20';
                needsUpdate = true;
            }
            if (newName.startsWith('2.2 ')) {
                newName = newName.replace(/^2\.2(\s+)/, '2.20$1');
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                updates.push(supabase.from('items').update({ name: newName, values: newValues }).eq('id', item.id));
                console.log(`   -> Updating to: ${newName.substring(0, 50)} | Code: 2.20`);
                updatedCount++;
            }
        }
    }
    
    console.log(`Found ${updatedCount} items to fix for 2.20.`);
    for (let i = 0; i < updates.length; i += 20) {
        await Promise.all(updates.slice(i, i + 20));
    }
    console.log(`Finished executing updates.`);
}

main().catch(console.error);
