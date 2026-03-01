import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data: items } = await supabase.from('items').select('id, name, group_id, groups(title)');
    
    console.log(`Analyzing ${items?.length || 0} items...`);
    
    const generalKeywords = ['NÓMINA', 'NOMINA', 'INSUMOS', 'TRANSPORTE', 'CAJA MENOR', 'FIJO'];
    
    const matches = items?.filter(item => {
        const name = (item.name || '').toUpperCase();
        return generalKeywords.some(kw => name.includes(kw));
    });

    console.log(`Found ${matches?.length || 0} items matching keywords.`);
    
    matches?.forEach(m => {
        console.log(`- [${m.name}] | Group: ${m.groups?.title} | ID: ${m.id}`);
    });
}

main().catch(console.error);
