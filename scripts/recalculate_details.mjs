import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Fetching items to get updated unit prices...");
    const { data: items, error: itemsErr } = await supabase.from('items').select('id, values');
    if (itemsErr) {
        console.error("Error fetching items", itemsErr);
        return;
    }
    
    const unitPrices = new Map();
    for (const item of items) {
        if (item.values && typeof item.values.unit_price === 'number') {
            unitPrices.set(String(item.id), item.values.unit_price);
        }
    }
    console.log("Loaded", unitPrices.size, "unit prices.");

    console.log("Fetching all financial_acta_details...");
    const { data: details, error: detErr } = await supabase.from('financial_acta_details').select('*');
    if (detErr) {
        console.error("Error fetching details", detErr);
        return;
    }
    
    let updatedCount = 0;
    
    for (const detail of details) {
        const currentUnitPrice = unitPrices.get(String(detail.item_id));
        if (currentUnitPrice === undefined) continue;

        let needsUpdate = false;
        const updates = {};

        // Recalculate 'value' based on 'quantity'
        if (detail.quantity !== null && detail.quantity !== undefined && detail.quantity !== 0) {
            const newValue = detail.quantity * currentUnitPrice;
            if (Math.abs((detail.value || 0) - newValue) > 0.01) {
                updates.value = newValue;
                needsUpdate = true;
            }
        } else if (detail.value !== 0 && detail.value !== null) {
            updates.value = 0;
            needsUpdate = true;
        }

        // Recalculate 'previous_value' based on 'previous_qty'
        if (detail.previous_qty !== null && detail.previous_qty !== undefined && detail.previous_qty !== 0) {
            const newPrevValue = detail.previous_qty * currentUnitPrice;
            if (Math.abs((detail.previous_value || 0) - newPrevValue) > 0.01) {
                updates.previous_value = newPrevValue;
                needsUpdate = true;
            }
        } else if (detail.previous_value !== 0 && detail.previous_value !== null) {
            updates.previous_value = 0;
            needsUpdate = true;
        }

        if (needsUpdate) {
            const { error: upErr } = await supabase
                .from('financial_acta_details')
                .update(updates)
                .eq('id', detail.id);
                
            if (upErr) {
                console.error(`Failed to update detail ${detail.id}:`, upErr);
            } else {
                updatedCount++;
            }
        }
    }

    console.log(`Finished recalculating values. Details updated: ${updatedCount}`);
}

main().catch(console.error);
