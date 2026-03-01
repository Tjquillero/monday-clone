import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: dbItems } = await supabase.from('items').select('id, name, values');
    const ids = [];
    const itemMap = new Map();
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        const code = String(item.values.code || '').trim().replace(/,/g, '.');
        if (code === '2.01' || item.name.includes('2.01')) {
            ids.push(item.id);
            itemMap.set(item.id, item);
        }
    }
    
    const { data: details } = await supabase.from('financial_acta_details').select('*').in('item_id', ids);
    
    // Acta simulation: Assuming we view an acta, we have current details and previous details. 
    // Let's pretend acta 32 is current, and all actas before are previous.
    // Group them by acta:
    const acts = {};
    for (const d of details) {
         if (!acts[d.acta_id]) acts[d.acta_id] = [];
         acts[d.acta_id].push(d);
    }
    
    let currentQty = 0;
    let currentValue = 0;
    let prevQty = 0;
    let prevVal = 0;
    
    // Sort acts by date/ID artificially
    for (const d of details) {
         if (d.acta_id === 'fb104f42-3a3a-43a1-8b82-e8ceee22081f') {
              // Current
              currentQty += d.quantity || 0;
              currentValue += d.value || 0;
         } else {
              // Previous
              prevQty += d.quantity || 0;
              prevVal += d.value || 0;
         }
         if (d.previous_qty) {
             prevQty = Math.max(prevQty, d.previous_qty);
         }
         if (d.previous_value) {
             prevVal = Math.max(prevVal, d.previous_value);
         }
    }

    const unitPrice = 622.0447207113872;
    console.log("Mock UI math:");
    console.log("Current QTY:", currentQty);
    console.log("Current VAL:", currentValue, "-> Expected:", currentQty * unitPrice);
    
    console.log("Accum Qty:", prevQty + currentQty);
    console.log("Accum Val:", prevVal + currentValue, "-> Expected:", (prevQty + currentQty) * unitPrice);
}

main().catch(console.error);
