import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Restoring general budget items...");
    
    // Get the first board
    const { data: boards } = await supabase.from('boards').select('*').limit(1);
    if (!boards || boards.length === 0) {
        console.error("No boards found.");
        return;
    }
    const boardId = boards[0].id;
    
    // Get or create PRESUPUESTO GENERAL group
    let { data: groups } = await supabase.from('groups')
        .select('*')
        .eq('board_id', boardId)
        .ilike('title', '%PRESUPUESTO GENERAL%')
        .limit(1);
        
    let targetGroupId;
    
    if (!groups || groups.length === 0) {
        // Find any group as fallback
        let { data: anyGroups } = await supabase.from('groups').select('*').eq('board_id', boardId).limit(1);
        if (anyGroups && anyGroups.length > 0) {
            targetGroupId = anyGroups[0].id;
        } else {
             console.error("No groups found in board.");
             return;
        }
    } else {
        targetGroupId = groups[0].id;
    }

    console.log("Using group ID:", targetGroupId);

    const rubros = ['Nómina', 'Insumos', 'Transporte', 'Fijo', 'Caja Menor'];
    
    for (const rubro of rubros) {
        const title = `${rubro} - General`;
        const { data: existing } = await supabase
            .from('items')
            .select('id')
            .eq('group_id', targetGroupId)
            .eq('name', title);
            
        if (!existing || existing.length === 0) {
            console.log(`Restoring missing item: ${title}`);
            const { error } = await supabase.from('items').insert({
                group_id: targetGroupId,
                board_id: boardId,
                name: title,
                position: 999,
                values: {
                    rubro: rubro,
                    category: 'General',
                    sub_category: 'General',
                    unit: 'Gl',
                    cant: 1,
                    unit_price: 0,
                    item_type: 'financial',
                    code: '0.0.0.0'
                }
            });
            if (error) {
                console.error(`Error inserting ${title}:`, error);
            } else {
                console.log(`Successfully created ${title}`);
            }
        } else {
            console.log(`${title} already exists.`);
        }
    }
    console.log("Done restoring.");
}
main().catch(console.error);
