import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    let report = "UNIVERSAL AUDIT\n\n";
    
    // Check Boards
    const { data: boards } = await supabase.from('boards').select('*');
    report += `TOTAL BOARDS: ${boards?.length || 0}\n`;
    
    // Check Groups
    const { data: groups } = await supabase.from('groups').select('*, boards(name)');
    report += `TOTAL GROUPS: ${groups?.length || 0}\n\n`;
    
    for (const g of groups || []) {
        const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', g.id);
        report += `GROUP: [${g.title}] (ID: ${g.id}) | Board: [${g.boards?.name}] | Items: ${count}\n`;
        
        if (count > 0) {
            const { data: items } = await supabase.from('items').select('name').eq('group_id', g.id);
            items?.forEach(i => {
                if (i.name.toUpperCase().includes('GENERAL') || i.name.toUpperCase().includes('NOMINA')) {
                    report += `  - MATCH: ${i.name}\n`;
                }
            });
        }
    }
    
    fs.writeFileSync('universal_audit.txt', report);
    console.log("Universal audit saved.");
}

main().catch(console.error);
