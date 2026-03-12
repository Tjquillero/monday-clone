import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: boards } = await supabase.from('boards').select('id, name');
    const { data: groups } = await supabase.from('groups').select('id, title, board_id');
    const { data: items, error } = await supabase.from('items').select('name, group_id, values');
    if (error) { console.error(error); return; }
    
    const sample = items.filter(i => /^(4\.10|1\.09|2\.08|1\.01|4\.55|4\.20|9\.2\.2|9\.5\.9|9\.2\.3)/.test(i.name)).slice(0, 50);
    
    let info = [];
    sample.forEach(i => {
       const g = groups.find(x => x.id === i.group_id);
       const b = g ? boards.find(x => x.id === g.board_id) : null;
       info.push({
           name: i.name,
           group: g ? g.title : 'NO_GROUP',
           board: b ? b.name : 'NO_BOARD'
       });
    });
    
    fs.writeFileSync('acta_dashboard_out2.json', JSON.stringify(info, null, 2), 'utf8');
}
check();
