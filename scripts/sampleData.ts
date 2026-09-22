import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('--- EXECUTIONS SAMPLE ---');
  const { data: execs, error: eErr } = await supabase.from('weekly_plan_item_executions').select('*').limit(2);
  if (eErr) console.error('Exec error:', eErr);
  else console.log('Sample executions:', execs);

  console.log('--- WEEKLY PLAN ITEMS SAMPLE ---');
  const { data: items, error: iErr } = await supabase.from('weekly_plan_items').select('*').limit(2);
  if (iErr) console.error('Items error:', iErr);
  else console.log('Sample items:', items);
}

main().catch(console.error);
