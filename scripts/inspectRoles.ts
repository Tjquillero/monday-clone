import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectRoles() {
  const { data, error } = await supabase.from('user_board_roles').select('*').limit(10);
  console.log('user_board_roles error:', error);
  console.log('user_board_roles data:', data);

  const { data: boards } = await supabase.from('boards').select('id, name').limit(5);
  console.log('boards:', boards);
}

inspectRoles();
