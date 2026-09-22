import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { resolveActivityDescriptiveName } from '../src/lib/activityCatalogResolver';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BOARD_ID = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';

async function trace() {
  console.log('--- 1. BUSCANDO PLANES DEL TABLERO ---');
  const { data: plans } = await supabase.from('weekly_plans').select('id, board_id, group_id').eq('board_id', BOARD_ID);
  console.log('Planes encontrados:', plans?.length);
  if (!plans || plans.length === 0) return;

  const planIds = plans.map(p => p.id);

  console.log('--- 2. BUSCANDO ESTÁNDARES DEL TABLERO ---');
  const { data: standards } = await supabase.from('board_activity_standards').select('activity_key, name').eq('board_id', BOARD_ID);
  console.log('Estándares encontrados:', standards?.length);
  const standardsMap = new Map<string, string>();
  standards?.forEach((s: any) => {
    if (s.activity_key && s.name) {
      standardsMap.set(s.activity_key, s.name);
    }
  });
  console.log('StandardsMap sample (1.10):', standardsMap.get('1.10'));

  console.log('--- 3. BUSCANDO ITEMS DE WEEKLY_PLAN_ITEMS ---');
  const { data: items } = await supabase.from('weekly_plan_items').select('*').in('plan_id', planIds).limit(10);
  console.log('Items encontrados (limit 10):', items?.length);

  items?.forEach((row: any, idx: number) => {
    const rawKey = row.activity_key;
    const stdName = standardsMap.get(rawKey);
    const resolvedWithStd = resolveActivityDescriptiveName(rawKey, standardsMap);
    const resolvedWithoutStd = resolveActivityDescriptiveName(rawKey);

    console.log(`\n[Item ${idx + 1}] ID: ${row.id}`);
    console.log(`  row.activity_key: "${rawKey}" (type: ${typeof rawKey})`);
    console.log(`  row.planned_qty: ${row.planned_qty} ${row.unit}`);
    console.log(`  standardsMap.get("${rawKey}"): "${stdName}"`);
    console.log(`  resolveActivityDescriptiveName(row.activity_key, standardsMap): "${resolvedWithStd}"`);
    console.log(`  resolveActivityDescriptiveName(row.activity_key): "${resolvedWithoutStd}"`);
  });
}

trace();
