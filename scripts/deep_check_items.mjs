
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: items } = await s.from('items').select('id, name, group_id, values');
  const counts = {};
  const dupes = [];
  
  items.forEach(i => {
    const normName = (i.name || '').trim().toLowerCase();
    const key = `${i.group_id}|${normName}`;
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] === 2) {
      dupes.push({ group_id: i.group_id, name: i.name, rubro: i.values?.rubro });
    }
  });
  
  if (dupes.length > 0) {
    console.log(`Found ${dupes.length} duplicate names within groups:`);
    console.log(JSON.stringify(dupes, null, 2));
  } else {
    console.log('No duplicate names found within any group.');
  }

  // Check for items with SAME NAME but DIFFERENT rubro
  const nameToRubro = {};
  const rubroConflict = [];
  items.forEach(i => {
    const normName = (i.name || '').trim().toLowerCase();
    const rubro = (i.values?.rubro || 'SIN CATEGORÍA').toUpperCase();
    if (!nameToRubro[normName]) {
      nameToRubro[normName] = rubro;
    } else if (nameToRubro[normName] !== rubro) {
      rubroConflict.push({ name: i.name, r1: nameToRubro[normName], r2: rubro });
    }
  });

  if (rubroConflict.length > 0) {
    console.log(`Found ${rubroConflict.length} items with same name but different Rubro (likely mixing work/costs):`);
    console.log(JSON.stringify(rubroConflict, null, 2));
  }
}
run();
