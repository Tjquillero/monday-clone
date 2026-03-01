import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log("CRITICAL RESTORE: Undoing over-aggressive deletion...");
    
    // Read the backup I made just before the disaster
    const backupContent = fs.readFileSync('all_items_final.json', 'utf8');
    const backupItems = JSON.parse(backupContent);
    
    // Get current items to see what's missing
    const { data: currentItems } = await supabase.from('items').select('id');
    const currentIds = new Set(currentItems?.map(i => i.id) || []);
    
    const missingItems = backupItems.filter(i => !currentIds.has(i.id));
    
    console.log(`Missing items to restore: ${missingItems.length}`);
    
    // Restore in chunks
    const CHUNK_SIZE = 50;
    for (let i = 0; i < missingItems.length; i += CHUNK_SIZE) {
        const chunk = missingItems.slice(i, i + CHUNK_SIZE);
        
        // EXCLUDE the "GENERAL" items that were the original targets of the user's request
        const toRestore = chunk.filter(item => {
            const name = item.name.toUpperCase();
            const isGeneral = name.includes('- GENERAL') || 
                             name === 'NÓMINA - GENERAL' || 
                             name === 'INSUMOS - GENERAL' || 
                             name === 'TRANSPORTE - GENERAL' || 
                             name === 'FIJO - GENERAL' || 
                             name === 'CAJA MENOR - GENERAL';
            return !isGeneral;
        });

        if (toRestore.length > 0) {
            console.log(`Restoring chunk of ${toRestore.length} items...`);
            const { error } = await supabase.from('items').insert(toRestore);
            if (error) console.error("Restore error:", error);
        }
    }
    
    console.log("Restore process finished.");
}

main().catch(console.error);
