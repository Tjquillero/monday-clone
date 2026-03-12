import { createClient } from '@supabase/supabase-client';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    console.log("Boards:", boards);
    
    // Check all rubros
    const { data: items } = await supabase.from('items').select('id, name, values');
    const rubros = new Set();
    const categories = new Set();
    items.forEach(i => {
        if (i.values && i.values.rubro) rubros.add(i.values.rubro);
        if (i.values && i.values.category) categories.add(i.values.category);
    });
    console.log("Rubros:", Array.from(rubros));
    console.log("Categories:", Array.from(categories));
    
    // Check a few items from each rubro
    for (const rubro of Array.from(rubros)) {
        console.log(`\nSample items for Rubro: ${rubro}`);
        const sample = items.filter(i => i.values?.rubro === rubro).slice(0, 5);
        sample.forEach(i => console.log(`- [${i.values?.category}] ${i.name}`));
    }
}
check();
