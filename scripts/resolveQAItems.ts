import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resolvePlazaItems() {
  const plazaPlanId = '4ba59dc5-c150-41f4-9168-f22e8480be84'; // Plaza Puerto Colombia week_start 2026-09-14

  console.log('=== WEEKLY PLAN ITEMS FOR PLAZA PUERTO COLOMBIA (PLAN 4ba59dc5-c150-41f4-9168-f22e8480be84) ===');
  const { data: items, error } = await supabase
    .from('weekly_plan_items')
    .select('id, plan_id, activity_key, planned_qty, unit, planned_jr, poa_activity_zone_id')
    .eq('plan_id', plazaPlanId);

  console.log('items count:', items?.length);
  console.log('items list:', JSON.stringify(items, null, 2));

  if (items && items.length > 0) {
    const zoneIds = items.map(i => i.poa_activity_zone_id).filter(Boolean);
    const { data: zones } = await supabase
      .from('poa_activity_zones')
      .select('id, poa_activity_id, zone')
      .in('id', zoneIds);
    
    if (zones && zones.length > 0) {
      const poaActIds = zones.map(z => z.poa_activity_id).filter(Boolean);
      const { data: poaActs } = await supabase
        .from('poa_activities')
        .select('id, name, unit, quantity')
        .in('id', poaActIds);

      const zoneMap = new Map(zones.map(z => [z.id, z]));
      const actMap = new Map(poaActs?.map(a => [a.id, a]));

      const enriched = items.map(item => {
        const zone = zoneMap.get(item.poa_activity_zone_id);
        const act = zone ? actMap.get(zone.poa_activity_id) : undefined;
        return {
          ...item,
          activity_name: act?.name,
          poa_unit: act?.unit,
          poa_total_qty: act?.quantity,
          zone: zone?.zone
        };
      });

      console.log('\nENRICHED ITEMS WITH POA NAMES:');
      console.log(JSON.stringify(enriched, null, 2));
    }
  }
}

resolvePlazaItems();
