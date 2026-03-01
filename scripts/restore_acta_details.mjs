import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log("Starting restoration with aggregation...");
    const content = fs.readFileSync('manual_acta_audit.txt', 'utf8');
    const lines = content.split('\n');
    
    const itemsRaw = JSON.parse(fs.readFileSync('items.json', 'utf8'));
    const itemMap = new Map();
    for (const item of itemsRaw) {
        itemMap.set(String(item.id), item);
    }
    
    const ACTA_ID = 'fb104f42-3a3a-43a1-8b82-e8ceee22081f'; 
    const TARGET_GROUP_ID = '98153f4c-18b9-4bff-abda-39d62db8a931'; 
    
    const recordsMap = new Map();
    
    for (const line of lines) {
        if (!line.startsWith('- DetailID:')) continue;
        const parts = line.split(' | ');
        const itemIdStr = parts.find(p => p.startsWith('ItemID:')).split('ItemID: ')[1].trim();
        const valueStr = parts.find(p => p.startsWith('Value:')).split('Value: ')[1].trim();
        
        let value = parseFloat(valueStr);
        if (value === 0 || isNaN(value)) continue;
        
        if (recordsMap.has(itemIdStr)) {
            recordsMap.set(itemIdStr, recordsMap.get(itemIdStr) + value);
        } else {
            recordsMap.set(itemIdStr, value);
        }
    }
    
    const recordsToInsert = [];
    
    for (const [itemIdStr, value] of recordsMap.entries()) {
        const itemInfo = itemMap.get(itemIdStr);
        let quantity = 0;
        
        if (itemInfo && itemInfo.values && itemInfo.values.unit_price > 0) {
            quantity = value / itemInfo.values.unit_price;
        }
        
        recordsToInsert.push({
            acta_id: ACTA_ID,
            item_id: itemIdStr,
            group_id: TARGET_GROUP_ID, 
            quantity: quantity,
            value: value,
            percentage: 0,
            previous_qty: 0,
            previous_value: 0
        });
    }
    
    console.log(`Preparing to restore ${recordsToInsert.length} unified details.`);
    
    if (recordsToInsert.length > 0) {
        const { data, error } = await supabase.from('financial_acta_details').upsert(recordsToInsert, { onConflict: 'acta_id,item_id,group_id' }).select();
        if (error) {
            console.error("Error inserting:", error);
        } else {
            console.log(`Successfully restored ${data.length} records into financial_acta_details.`);
        }
    }
}

main().catch(console.error);
