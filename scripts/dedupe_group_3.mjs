import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    let start = 0;
    const limit = 1000;
    let group3Items = [];
    
    while (true) {
        const { data: items } = await supabase
            .from('items')
            .select('id, name, values, position')
            .range(start, start + limit - 1)
            .eq('group_id', '41bdd7d8-f199-45da-b781-5a00e5ccde05'); // The master group ID found
            
        if (!items || items.length === 0) break;
        
        for (const i of items) {
             let code = String(i.values?.code || '').trim();
             if (!code) {
                 const match = i.name.match(/^(\d+(?:\.\d+)*)/);
                 if (match) code = match[1];
             }
             if (code && code.startsWith('3.')) {
                 group3Items.push({ ...i, extractedCode: code });
             }
        }
        start += limit;
    }
    
    // Check details for all items to know what is safe to delete
    const ids = group3Items.map(i => i.id);
    const { data: details } = await supabase.from('financial_acta_details').select('item_id').in('item_id', ids);
    let counts = {};
    if (details) {
        for (const d of details) {
            if (!counts[d.item_id]) counts[d.item_id] = 0;
            counts[d.item_id]++;
        }
    }
    
    // First, fix 3.1 -> 3.10 and delete the empty 3.10
    const item3_1 = group3Items.find(i => i.extractedCode === '3.1');
    const item3_10 = group3Items.find(i => i.extractedCode === '3.10' && i.name.startsWith('3.10'));
    
    if (item3_1 && item3_10) {
        console.log(`Renaming 3.1 (${item3_1.id}) to 3.10 explicitly, saving its ${counts[item3_1.id] || 0} details...`);
        let newValues = { ...item3_1.values, code: '3.10' };
        await supabase.from('items').update({
             name: '3.10 MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRIFUGAS  PARA SUMINISTRO DE AGUA POTABLE Y CRUDA PARA BAÑOS, FUENTE DE AGUA,SISTEMA DE RIEGO, ACHIQUE, FILTRADO Y REDES CONTRA INCENDIO. INCLUYE: MATERIALES E INSUMOS PARA CALIBRACIÓN DE TANQUES HIDROFLOW,AJUSTE DE PRESOSTATO PARA PRUEBA DE OPERACIÓN DE NIVELES Y CALIBRACIÓN DE PRESIONES DE TRABAJO, INSPECCIÓN DE CHEQUES DE RETENCIÓN, REVISIÓN Y CAMBIO DE SELLOS MECANICOS, REVISIÓN Y CAMBIO DE RODAMIENTOS, REVISIÓN DE TABLEROS DE CONTROL, REVISIÓN DE BOMBINAS Y TODOS LOS ELEMENTOS NECESARIOS PARA CORRECTA EJECUCIÓN ',
             values: newValues
        }).eq('id', item3_1.id);
        
        console.log(`Deleting duplicate blank 3.10 (${item3_10.id})...`);
        await supabase.from('items').delete().eq('id', item3_10.id);
        
        // Update our array references so the general deduper ignores these
        group3Items = group3Items.filter(i => i.id !== item3_1.id && i.id !== item3_10.id);
    }
    
    // Group by Code for the rest
    const codeMap = {};
    for (const i of group3Items) {
         if (!codeMap[i.extractedCode]) codeMap[i.extractedCode] = [];
         codeMap[i.extractedCode].push(i);
    }
    
    // Deduplicate
    for (const [code, itemsList] of Object.entries(codeMap)) {
         if (itemsList.length > 1) {
              console.log(`Found ${itemsList.length} duplicates for ${code}`);
              // Sort by details count descending
              itemsList.sort((a,b) => (counts[b.id] || 0) - (counts[a.id] || 0));
              
              const keeper = itemsList[0];
              console.log(`  Keeping ID: ${keeper.id} (Has ${counts[keeper.id] || 0} details)`);
              
              for (let i = 1; i < itemsList.length; i++) {
                   const dupe = itemsList[i];
                   console.log(`  Deleting ID: ${dupe.id} (Has ${counts[dupe.id] || 0} details)`);
                   if ((counts[dupe.id] || 0) > 0) {
                        console.warn(`  WARNING: DELETING ITEM WITH ${counts[dupe.id]} DETAILS! Aborting this specific deletion just in case.`);
                   } else {
                        await supabase.from('items').delete().eq('id', dupe.id);
                   }
              }
         }
    }
    console.log("Deduplication complete.");
}

main().catch(console.error);
