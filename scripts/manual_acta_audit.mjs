import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Fetching details...");
    const { data: details } = await supabase.from('financial_acta_details').select('*');
    console.log("Fetching items...");
    const { data: items } = await supabase.from('items').select('id, name');
    
    const itemMap = new Map();
    items?.forEach(i => itemMap.set(String(i.id), i.name));
    
    let report = `AUDIT OF ACTA DETAILS (${details?.length || 0} rows)\n\n`;
    
    details?.forEach(d => {
        const itemName = itemMap.get(String(d.item_id)) || 'DELETED_OR_UNKNOWN';
        report += `- DetailID: ${d.id} | Item: [${itemName}] | ItemID: ${d.item_id} | Value: ${d.value}\n`;
    });
    
    fs.writeFileSync('manual_acta_audit.txt', report);
    console.log("Manual audit saved.");
}

main().catch(console.error);
