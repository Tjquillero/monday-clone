import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const boardId = 'ff77409f-848a-48a1-8f29-6e6e3cc8cde3'; // Board "CONTROL DE COSTOS - ACTA"
    
    const { data: items } = await supabase.from('items').select('*').eq('board_id', boardId);
    console.log("Total items:", items.length);

    console.log("Distinct Categories:");
    const categories = new Set(items.map(i => i.values?.category).filter(Boolean));
    console.log([...categories]);
    
    console.log("\nDistinct Subcategories:");
    const subs = new Set(items.map(i => i.values?.sub_category).filter(Boolean));
    console.log([...subs]);

    console.log("\nSample items matching 4.10, 1.09, 2.08, 1.01:");
    const sample = items.filter(i => /^(4\.10|1\.09|2\.08|1\.01)/.test(i.name)).slice(0, 15);
    sample.forEach(i => console.log(`- ${i.name} | Category: ${i.values?.category} | Sub: ${i.values?.sub_category} | Rubro: ${i.values?.rubro}`));
}
check();
