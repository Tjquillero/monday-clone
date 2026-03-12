
import { supabase } from './src/lib/supabaseClient.js';

async function check() {
    const { data } = await supabase.from('items').select('name').ilike('name', '%acta%');
    console.log('Items containing "acta":', data?.length || 0);
    if (data && data.length > 0) {
        console.log(data.slice(0, 10));
    }
}
check();
