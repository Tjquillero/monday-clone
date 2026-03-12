import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items, error } = await supabase.from('items').select('name, values');
    if (error) { console.error(error); return; }
    
    const countNoRubro = items.filter(i => !i.values?.rubro || i.values?.rubro.trim() === '').length;
    console.log(`Items with empty/no rubro: ${countNoRubro}`);
    
    const noRubroItems = items.filter(i => !i.values?.rubro || i.values?.rubro.trim() === '');
    console.log("Sample of items without rubro:");
    noRubroItems.slice(0, 5).forEach(i => console.log(i.name));
    
    const countWithRubro = items.filter(i => i.values?.rubro && i.values?.rubro.trim() !== '').length;
    console.log(`Items with rubro: ${countWithRubro}`);
}
check();
