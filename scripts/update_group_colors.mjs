import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let out = "";
    const log = (msg) => { out += msg + '\n'; console.log(msg); };
    
    const { data: groups, error } = await supabase
        .from('groups')
        .select('id, title, color')
        .order('title');
        
    if (error) {
         log(error.message);
         return;
    }
    
    // Default palette for monday.com
    const colorMap = {
        '4': '#fdab3d',  // orange
        '5': '#e2445c',  // red
        '6': '#ffcb00',  // yellow
        '7': '#0086c0',  // dark blue
        '8': '#ff158a',  // pink
        '9': '#9cd326',  // light green
    };

    let updates = [];
    for (const g of groups) {
         // Some might just be "4" or contain it. Look for the number at the start or after "Grupo"
         let num = null;
         const match = g.title.match(/(?:Grupo\s+)?(\d+)/i);
         if (match) {
             num = match[1];
             if (parseInt(num) >= 4) {
                 const newColor = colorMap[num] || '#808080';
                 if (g.color !== newColor) {
                     updates.push({ id: g.id, oldColor: g.color, newColor: newColor, title: g.title });
                 }
             }
         }
    }
    
    log(`Found ${updates.length} groups to update colors:`);
    for (const u of updates) {
         log(`${u.title}: ${u.oldColor} -> ${u.newColor}`);
         const { error: updErr } = await supabase.from('groups').update({ color: u.newColor }).eq('id', u.id);
         if (updErr) log("Error updating " + u.title + " " + updErr.message);
    }
    log("Color assignment complete.");
    fs.writeFileSync('group_colors_out.txt', out);
}
main().catch(console.error);
