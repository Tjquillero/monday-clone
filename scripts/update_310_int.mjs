import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const targetGroups = ['1cb17fc5-8ff0-4822-83b8-6a5ba1daddcc', '41bdd7d8-f199-45da-b781-5a00e5ccde05'];
    
    // We update name first, directly.
    const newName = "3.10 MANTENIMIENTO PREVENTIVO TIPO A DE BOMBAS CENTRIFUGAS  PARA SUMINISTRO DE AGUA POTABLE Y CRUDA PARA BAÑOS, FUENTE DE AGUA,SISTEMA DE RIEGO, ACHIQUE, FILTRADO Y REDES CONTRA INCENDIO. INCLUYE: MATERIALES E INSUMOS PARA CALIBRACIÓN DE TANQUES HIDROFLOW,AJUSTE DE PRESOSTATO PARA PRUEBA DE OPERACIÓN DE NIVELES Y CALIBRACIÓN DE PRESIONES DE TRABAJO, INSPECCIÓN DE CHEQUES DE RETENCIÓN, REVISIÓN Y CAMBIO DE SELLOS MECANICOS, REVISIÓN Y CAMBIO DE RODAMIENTOS, REVISIÓN DE TABLEROS DE CONTROL, REVISIÓN DE BOMBINAS Y TODOS LOS ELEMENTOS NECESARIOS PARA CORRECTA EJECUCIÓN";

    for (const groupId of targetGroups) {
        const { data: siblings } = await supabase
            .from('items')
            .select('id, name, position')
            .eq('group_id', groupId)
            .order('position', { ascending: true });

        let pos309 = null;
        let id310 = null;
        let p310 = null;

        for (const sib of siblings) {
            if (sib.name.includes('3.09 ')) pos309 = sib.position;
            if (sib.name.includes('3.10') || sib.name.toLowerCase().includes('bombas centrifugas')) {
                id310 = sib.id;
                p310 = sib.position;
            }
        }

        if (id310 && pos309 !== null) {
            console.log(`\nFound 3.09 at pos ${pos309}, 3.10 at pos ${p310} in group ${groupId}`);
            
            // To place 3.10 right after 3.09 => target position is pos309 + 1
            const targetPos = pos309 + 1;
            
            if (p310 !== targetPos) {
                 // only if it needs physically moving
                 // shift siblings down that are currently standing between 3.09 and its target
                 console.log("Shifting elements down by 1...");
                 const toShift = siblings.filter(s => s.position >= targetPos && s.id !== id310);
                 
                 // We can execute promises in parallel to speed it up heavily
                 const updatePromises = toShift.map(s => supabase.from('items').update({ position: s.position + 1 }).eq('id', s.id));
                 
                 // Do batches of 20
                 for (let i = 0; i < updatePromises.length; i += 20) {
                     await Promise.all(updatePromises.slice(i, i + 20));
                 }
            }

            const { error: upErr } = await supabase.from('items').update({ 
                 name: newName,
                 position: targetPos
            }).eq('id', id310);

            if (upErr) console.error(`Failed to update 3.10 in group ${groupId}:`, upErr);
            else console.log(`Successfully relocated and renamed 3.10 in group ${groupId} to integer position ${targetPos}`);
        } else {
             console.log(`Missing 3.09 or 3.10 in group ${groupId}`);
        }
    }
}

main().catch(console.error);
