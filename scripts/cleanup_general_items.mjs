import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("Cleaning up accidentally inserted General items...");
    
    // Identificar y borrar rubros con categoría 'General' que fueron insertados por los scripts de semilla
    const { data: deleted, error } = await supabase
        .from('items')
        .delete()
        .eq('values->>category', 'General')
        .eq('values->>sub_category', 'General')
        .select('id, name');

    if (error) {
        console.error("Error deleting items:", error);
    } else {
        console.log(`Successfully deleted ${deleted?.length || 0} items that were incorrectly added to the Acta.`);
        if (deleted && deleted.length > 0) {
            deleted.forEach(item => console.log(`- Deleted: ${item.name}`));
        }
    }
}

main().catch(console.error);
