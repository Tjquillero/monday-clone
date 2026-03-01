import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Searching for Acta Details linked to PRESUPUESTO GENERAL...");
    
    // 1. Identify the group ID for "PRESUPUESTO GENERAL"
    const { data: groups } = await supabase.from('groups').select('id, title').ilike('title', 'PRESUPUESTO GENERAL');
    const generalGroupIds = groups?.map(g => g.id) || [];
    console.log("General Group IDs:", generalGroupIds);
    
    if (generalGroupIds.length === 0) {
        console.log("No general budget group found.");
        return;
    }
    
    // 2. Fetch Acta Details where group_id matches "PRESUPUESTO GENERAL"
    // OR where item_id belongs to that group
    const { data: details } = await supabase.from('financial_acta_details').select('id, item_id, group_id');
    
    const itemsInGeneralGroup = await supabase.from('items').select('id').in('group_id', generalGroupIds);
    const itemIds = new Set(itemsInGeneralGroup.data?.map(i => i.id) || []);
    
    const targetedDetails = details?.filter(d => generalGroupIds.includes(d.group_id) || itemIds.has(d.item_id));
    
    console.log(`Found ${targetedDetails?.length || 0} acta details that shouldn't be there.`);
    
    if (targetedDetails && targetedDetails.length > 0) {
        for (const detail of targetedDetails) {
            console.log(`Deleting Acta Detail ID: ${detail.id}`);
            const { error } = await supabase.from('financial_acta_details').delete().eq('id', detail.id);
            if (error) console.error("Error deleting detail:", error);
        }
    }
    
    console.log("CLEANUP DONE.");
}

main().catch(console.error);
