
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://azhkbijknwywpqtgknus.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6aGtiaWprbnd5d3BxdGdrbnVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNTgyODQsImV4cCI6MjA4NDkzNDI4NH0.Jb0K8RcVf3b8cf6cH8UDxydzdXqSBI0dvqNensqNBnM'
);

async function check() {
    console.log('--- TABLES ---');
    const { data: boards, error: bError } = await supabase.from('boards').select('id, name');
    console.log('Boards:', boards, 'Error:', bError);

    const { data: group, error: gError } = await supabase.from('groups').select('*').eq('id', '98153f4c-18b9-4bff-abda-39d62db8a931').single();
    console.log('Group detail:', group, 'Error:', gError);

    const { data: allGroups, error: allGError } = await supabase.from('groups').select('id, title');
    console.log('All Groups (raw names):', allGroups, 'Error:', allGError);

    const { data: items, error: iError } = await supabase.from('items').select('id, name, group_id').limit(10);
    console.log('Items (limit 10):', items, 'Error:', iError);
}

check();
