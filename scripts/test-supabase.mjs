import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Env Vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing connection to:', supabaseUrl);
  const { data, error } = await supabase.from('boards').select('*').limit(1);
  if (error) {
    console.error('Fetch Error:', error);
  } else {
    console.log('Fetch Success:', data);
  }
}

test();
