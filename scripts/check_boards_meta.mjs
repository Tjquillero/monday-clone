
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('*').order('created_at', { ascending: false });
    console.log('Boards ordered by created_at (DESC):');
    boards.forEach(b => console.log(`${b.name} (${b.id}) - Created: ${b.created_at}`));
}

check();
