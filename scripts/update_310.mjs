import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const { data: dbItems, error } = await supabase.from('items').select('id, name, values');
    if (error) {
        console.error("Error fetching items", error);
        return;
    }

    let foundItem = null;
    for (const item of dbItems) {
        if (!item.values || item.values.item_type !== 'financial') continue;
        
        // Find 3.10
        let extractedCode = String(item.values.code || '').trim().replace(/,/g, '.');
        if (!extractedCode) {
            const normName = item.name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
            const codeMatch = normName.match(/^(\d+(?:[.,]\d+)*)[\s.\-:]*\s*(.+)$/);
            if (codeMatch) extractedCode = codeMatch[1].replace(/\.$/, '').replace(/,/g, '.');
        }

        if (extractedCode === '3.10') {
             foundItem = item;
             break;
        }
    }

    if (foundItem) {
        console.log(`Found item 3.10! ID: ${foundItem.id}`);
        console.log(`Old Name: ${foundItem.name}`);
        
        const newName = "3.10 MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRIFUGAS  PARA SUMINISTRO DE AGUA POTABLE Y CRUDA PARA BAÑOS, FUENTE DE AGUA,SISTEMA DE RIEGO, ACHIQUE, FILTRADO Y REDES CONTRA INCENDIO. INCLUYE: MATERIALES E INSUMOS PARA CALIBRACIÓN DE TANQUES HIDROFLOW,AJUSTE DE PRESOSTATO PARA PRUEBA DE OPERACIÓN DE NIVELES Y CALIBRACIÓN DE PRESIONES DE TRABAJO, INSPECCIÓN DE CHEQUES DE RETENCIÓN, REVISIÓN Y CAMBIO DE SELLOS MECANICOS, REVISIÓN Y CAMBIO DE RODAMIENTOS, REVISIÓN DE TABLEROS DE CONTROL, REVISIÓN DE BOMBINAS Y TODOS LOS ELEMENTOS NECESARIOS PARA CORRECTA EJECUCIÓN";
        
        console.log(`Updating to new name...`);
        const { error: updateErr } = await supabase.from('items').update({ name: newName }).eq('id', foundItem.id);
        
        if (updateErr) {
             console.error("Failed to update item name:", updateErr);
        } else {
             console.log("Successfully updated item 3.10's description in the database.");
             // Also checking if there's any position to change. 
             // Usually it's handled by `position` column. We will print it to see.
             const { data: fetchPos } = await supabase.from('items').select('position').eq('id', foundItem.id).single();
             console.log("Current position:", fetchPos?.position);
        }
    } else {
        console.log("Item 3.10 not found in database.");
    }
}

main().catch(console.error);
