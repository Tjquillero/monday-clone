import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: dbItems, error } = await supabase.from('items').select('id, name, group_id, values');
    
    let badCount = 0;
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        const code = String(item.values.code || '').trim().replace(/,/g, '.');
        if (code === '2.01' || item.name.includes('2.01') || code === '2.02' || item.name.includes('2.02')) {
            const price = item.values.unit_price;
            console.log(`ID: ${item.id} | Name: ${item.name.substring(0, 30)} | Price: ${price}`);
            if (price < 600 && code === '2.01') badCount++;
            if (price < 700 && code === '2.02') badCount++;
        }
    }
    console.log(`Found ${badCount} bad prices still.`);
}
main().catch(console.error);
