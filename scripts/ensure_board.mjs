import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Checking for boards...");
    const { data: boards, error: bError } = await supabase.from('boards').select('*');
    if (bError) {
        console.error("Error fetching boards:", bError);
        return;
    }

    if (boards.length === 0) {
        console.log("No boards found. Attempting to create a default board...");
        const { data: newBoard, error: cError } = await supabase.from('boards').insert({
            name: 'Tablero Principal de Obra',
            description: 'Tablero principal para la gestión financiera de la obra.'
        }).select().single();

        if (cError) {
            console.error("Error creating board:", cError);
            console.log("Tip: If this is an RLS error, you might need to insert a board with an owner_id or disable RLS.");
        } else {
            console.log("Successfully created board:", newBoard.id);
        }
    } else {
        console.log("Found existing boards:", boards.length);
        boards.forEach(b => console.log(`- ${b.name} (${b.id})`));
    }
}

main().catch(console.error);
