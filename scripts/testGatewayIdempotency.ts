import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: members } = await supabase.from('board_members').select('*');
  console.log('All board members:', members);

  if (members && members.length > 0) {
    for (const m of members) {
      const { data: plans } = await supabase.from('weekly_plans').select('*').eq('board_id', m.board_id);
      console.log(`Board ${m.board_id} has ${plans?.length || 0} plans.`);
      if (plans && plans.length > 0) {
        for (const p of plans) {
          const { data: items } = await supabase.from('weekly_plan_items').select('*').eq('plan_id', p.id);
          console.log(`  Plan ${p.id} (status: ${p.status}) has ${items?.length || 0} items.`);
        }
      }
    }
  }
}

main().catch(console.error);
