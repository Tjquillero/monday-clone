
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data: items } = await s.from('items').select('*').lt('values->cant', 0);
    console.log(`Negatives by Qty: ${items?.length || 0}`);
    items?.forEach(i => console.log(`${i.name}: Qty ${i.values.cant}`));
    
    const { data: items2 } = await s.from('items').select('*').lt('values->unit_price', 0);
    console.log(`Negatives by Price: ${items2?.length || 0}`);
    items2?.forEach(i => console.log(`${i.name}: Price ${i.values.unit_price}`));
}
run();
