
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkCollisions() {
  console.log('--- CHECKING NAME COLLISIONS ---');
  
  const { data: items, error } = await supabase
    .from('items')
    .select('id, name, values');
    
  if (error) {
    console.error(error);
    return;
  }
  
  const activities = items.filter(i => 
    i.values?.item_type === 'financial' && 
    i.values?.rubro !== 'INSUMOS' && 
    i.values?.rubro !== 'SIN CATEGORÍA'
  );
  
  const insumos = items.filter(i => 
    i.values?.rubro === 'INSUMOS'
  );
  
  console.log(`Activities: ${activities.length}`);
  console.log(`Insumos: ${insumos.length}`);
  
  const actNames = new Set(activities.map(a => a.name.trim().toLowerCase()));
  const collisions = insumos.filter(ins => actNames.has(ins.name.trim().toLowerCase()));
  
  if (collisions.length > 0) {
    console.warn(`Found ${collisions.length} items that exist as both Activity and Insumo!`);
    collisions.forEach(c => console.log(`Collision: "${c.name}"`));
  } else {
    console.log('No name collisions found between Activities and Insumos.');
  }

  // Check for duplicate names within activities
  const actNameCounts = {};
  activities.forEach(a => {
    const n = a.name.trim().toLowerCase();
    actNameCounts[n] = (actNameCounts[n] || 0) + 1;
  });
  
  const internalDupes = Object.entries(actNameCounts).filter(([name, count]) => count > 1);
  if (internalDupes.length > 0) {
    console.warn(`Found ${internalDupes.length} duplicate names within Activities!`);
  }

  console.log('--- END ---');
}

checkCollisions();
