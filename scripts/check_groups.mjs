import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data } = await supabase.from('groups').select('id, title, position').order('created_at');
    console.log("Current groups:");
    data.forEach(g => console.log(`- ${g.title} (${g.id}) pos: ${g.position}`));
}
main().catch(console.error);
