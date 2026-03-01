import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { count: bCount } = await supabase.from('boards').select('*', { count: 'exact', head: true });
    const { count: gCount } = await supabase.from('groups').select('*', { count: 'exact', head: true });
    const { count: iCount } = await supabase.from('items').select('*', { count: 'exact', head: true });
    const { count: dCount } = await supabase.from('financial_acta_details').select('*', { count: 'exact', head: true });

    console.log(`FINAL COUNTS: Boards=${bCount}, Groups=${gCount}, Items=${iCount}, Details=${dCount}`);
}

main().catch(console.error);
