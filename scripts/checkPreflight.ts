import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runPreflight() {
  console.log('--- PREFLIGHT C1 VIA POSTGREST ---');
  const { data, error } = await supabase
    .from('weekly_plan_item_executions')
    .select('source_mutation_id');

  if (error) {
    console.error('Error fetching executions:', error.message);
    return;
  }

  console.log(`Total executions in table: ${data.length}`);
  const counts: Record<string, number> = {};
  for (const row of data) {
    if (row.source_mutation_id) {
      counts[row.source_mutation_id] = (counts[row.source_mutation_id] || 0) + 1;
    }
  }

  const duplicates = Object.entries(counts).filter(([_, c]) => c > 1);
  console.log(`Duplicated source_mutation_id count: ${duplicates.length}`);
  if (duplicates.length > 0) {
    console.log('Duplicates found:', duplicates);
  } else {
    console.log('C1 PREFLIGHT RESULT: 0 duplicates (PASS)');
  }
}

runPreflight();
