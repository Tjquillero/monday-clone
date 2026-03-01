import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Auditing Acta Details...");
    const { data: details, error } = await supabase
        .from('financial_acta_details')
        .select('*, items(name)');
    
    if (error) {
        console.error(error);
        return;
    }
    
    console.log(`Found ${details?.length || 0} acta details.`);
    
    const report = details.map(d => {
        return `- DetailID: ${d.id} | Item: ${d.items?.name || 'UNKNOWN'} | ItemID: ${d.item_id}`;
    }).join('\n');
    
    fs.writeFileSync('acta_details_audit.txt', report);
    console.log("Saved to acta_details_audit.txt");
}

main().catch(console.error);
