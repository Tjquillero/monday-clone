import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Final audit of orphaned acta details...");
    
    // 1. Get all details
    const { data: details } = await supabase.from('financial_acta_details').select('id, item_id');
    
    // 2. Get all item IDs
    const { data: items } = await supabase.from('items').select('id');
    const itemIds = new Set(items?.map(i => i.id) || []);
    
    const orphans = details?.filter(d => !itemIds.has(d.item_id));
    
    console.log(`Found ${orphans?.length || 0} orphaned acta details.`);
    
    if (orphans && orphans.length > 0) {
        for (const o of orphans) {
            console.log(`Deleting orphaned detail: ${o.id}`);
            await supabase.from('financial_acta_details').delete().eq('id', o.id);
        }
    }
    
    console.log("Finalized.");
}

main().catch(console.error);
