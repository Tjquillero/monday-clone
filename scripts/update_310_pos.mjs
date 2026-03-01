import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const targetGroups = ['1cb17fc5-8ff0-4822-83b8-6a5ba1daddcc', '41bdd7d8-f199-45da-b781-5a00e5ccde05'];

    for (const groupId of targetGroups) {
        // Fetch all items in this group
        const { data: siblings } = await supabase
            .from('items')
            .select('id, name, position, values')
            .eq('group_id', groupId)
            .order('position', { ascending: true });

        // find 3.09 to get its position, and 3.10 to update it
        let pos309 = 0;
        let id310 = null;
        let id310Item = null;

        for (const sib of siblings) {
            if (sib.name.includes('3.09')) {
                pos309 = sib.position;
            }
            if (sib.name.includes('3.10') || sib.name.toLowerCase().includes('bombas centrifugas')) {
                id310 = sib.id;
                id310Item = sib;
            }
        }

        if (id310 && pos309 !== 0) {
            console.log(`\nFound 3.09 at pos ${pos309} in group ${groupId}`);
            console.log(`Found 3.10 with id ${id310} currently at pos ${id310Item.position}`);

            // Shift everything after 3.09 down by 1 to make room
            for (const sib of siblings) {
                if (sib.position > pos309 && sib.id !== id310) {
                     await supabase.from('items').update({ position: sib.position + 1 }).eq('id', sib.id);
                }
            }

            const newName = "3.10 MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRIFUGAS  PARA SUMINISTRO DE AGUA POTABLE Y CRUDA PARA BAÑOS, FUENTE DE AGUA,SISTEMA DE RIEGO, ACHIQUE, FILTRADO Y REDES CONTRA INCENDIO. INCLUYE: MATERIALES E INSUMOS PARA CALIBRACIÓN DE TANQUES HIDROFLOW,AJUSTE DE PRESOSTATO PARA PRUEBA DE OPERACIÓN DE NIVELES Y CALIBRACIÓN DE PRESIONES DE TRABAJO, INSPECCIÓN DE CHEQUES DE RETENCIÓN, REVISIÓN Y CAMBIO DE SELLOS MECANICOS, REVISIÓN Y CAMBIO DE RODAMIENTOS, REVISIÓN DE TABLEROS DE CONTROL, REVISIÓN DE BOMBINAS Y TODOS LOS ELEMENTOS NECESARIOS PARA CORRECTA EJECUCIÓN";
            const targetPos = pos309 + 1;

            const { error: upErr } = await supabase.from('items').update({ 
                 name: newName,
                 position: targetPos
            }).eq('id', id310);

            if (upErr) {
                 console.error(`Failed to update 3.10 in group ${groupId}:`, upErr);
            } else {
                 console.log(`Successfully relocated and renamed 3.10 in group ${groupId} to position ${targetPos}`);
            }
        } else {
             console.log(`Missing 3.09 or 3.10 in group ${groupId}`);
        }
    }
}

main().catch(console.error);
