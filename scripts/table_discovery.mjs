import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    // Try to list tables via a common hack or just guess names
    const commonTables = ['items', 'groups', 'boards', 'financial_actas', 'financial_acta_details', 'financial_items', 'budget', 'nodes'];
    for (const t of commonTables) {
        const { error } = await supabase.from(t).select('count', { count: 'exact', head: true });
        if (!error) console.log(`Table exists: ${t}`);
    }
}

main().catch(console.error);
