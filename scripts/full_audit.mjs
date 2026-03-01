import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    let output = "FULL DATABASE AUDIT\n\n";
    
    const { data: boards } = await supabase.from('boards').select('*');
    for (const board of boards || []) {
        output += `BOARD: ${board.name} (${board.id})\n`;
        const { data: groups } = await supabase.from('groups').select('*').eq('board_id', board.id);
        for (const group of groups || []) {
            const { count } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('group_id', group.id);
            output += `  GROUP: [${group.title}] (ID: ${group.id}) - ITEMS: ${count}\n`;
            
            if (count > 0 && (count < 50 || group.title.includes('GENERAL'))) {
                const { data: sampleItems } = await supabase.from('items').select('name').eq('group_id', group.id).limit(100);
                sampleItems?.forEach(i => {
                    output += `    * ${i.name}\n`;
                });
            }
        }
        output += "\n";
    }
    
    fs.writeFileSync('db_audit_report.txt', output);
    console.log("Audit report saved to db_audit_report.txt");
}

main().catch(console.error);
