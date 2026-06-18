
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
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

  const report = {
    dupeNamesInSameGroup: dupes,
    rubroConflicts: rubroConflict
  };

  fs.writeFileSync('deep_report.json', JSON.stringify(report, null, 2));
  console.log('Report saved to deep_report.json');
}
run();
