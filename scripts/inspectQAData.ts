import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function discoverSchema() {
  console.log('=== 1. SAMPLE WEEKLY PLAN ITEM ===');
  const { data: itemSample, error: itemErr } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .limit(3);
  console.log('weekly_plan_items sample error:', itemErr);
  console.log('weekly_plan_items sample data:', itemSample);

  console.log('\n=== 2. PERSONNEL & SITE ASSIGNMENTS ===');
  const { data: personnel, error: persErr } = await supabase
    .from('personnel')
    .select('*')
    .limit(10);
  console.log('personnel:', personnel, persErr);

  const { data: siteAssign, error: siteErr } = await supabase
    .from('personnel_site_assignments')
    .select('*')
    .limit(10);
  console.log('personnel_site_assignments:', siteAssign, siteErr);

  console.log('\n=== 3. USER ROLES / MEMBRESÍAS DE TABLERO ===');
  const { data: boardMembers, error: bmErr } = await supabase
    .from('board_members')
    .select('*')
    .limit(10);
  console.log('board_members:', boardMembers, bmErr);
}

discoverSchema();
