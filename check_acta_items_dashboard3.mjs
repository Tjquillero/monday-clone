import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: items, error } = await supabase.from('items').select('name, values');
    if (error) { console.error(error); return; }
    
    const sample = items.filter(i => /^(4\.10|1\.09|2\.08|1\.01|4\.55|4\.20|9\.2\.2|9\.5\.9|9\.2\.3)/.test(i.name)).slice(0, 50);
    
    let itemsByRubro = {};
    sample.forEach(i => {
       const r = i.values?.rubro || 'NO_RUBRO';
       const c = i.values?.category || 'NO_CATEGORY';
       if (!itemsByRubro[r]) itemsByRubro[r] = [];
       itemsByRubro[r].push(`${i.name} (Cat: ${c})`);
    });
    
    fs.writeFileSync('acta_dashboard_out.json', JSON.stringify(itemsByRubro, null, 2), 'utf8');
}
check();
