import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items, error } = await supabase.from('items').select('*');
    if (error) { console.error(error); return; }
    
    console.log("Total items:", items.length);

    console.log("Distinct Categories:");
    const categories = new Set(items.map(i => i.values?.rubro).filter(Boolean));
    console.log([...categories]);
    
    console.log(`\nSample items starting with numbers from user image:`);
    const sample = items.filter(i => /^(4\.10|1\.09|2\.08|1\.01|4\.55|4\.20|9\.2\.2|9\.5\.9|9\.2\.3)/.test(i.name)).slice(0, 50);
    
    let itemsByRubro = {};
    sample.forEach(i => {
       const r = i.values?.rubro || 'NO_RUBRO';
       if (!itemsByRubro[r]) itemsByRubro[r] = [];
       itemsByRubro[r].push(i.name);
    });
    
    console.log(JSON.stringify(itemsByRubro, null, 2));

    const rubrosWithEmptyString = items.filter(i => i.values?.rubro === '').map(i => i.name).slice(0, 5);
    console.log("Items with empty rubro:", rubrosWithEmptyString);
}
check();
