import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const itemsToInsert = [
    // NOMINA - OPERATIVOS
    { name: 'MO JARDINEROS -  X DIAS PDO', unit: 'Mes', qty: 385, price: 60000, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'MO PERSONAL - ZV Y Z.D', unit: 'Mes', qty: 29, price: 2590337, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'MO PERSONAL - MTTO PLAYAS', unit: 'Mes', qty: 19, price: 2552682, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'AYUDANTE LIMPIEZA PLAYAS', unit: 'Mes', qty: 0, price: 0, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'SUPERVISORES - MTTO', unit: 'Mes', qty: 2, price: 3267144, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'OFICIAL OBRA CIVIL', unit: 'Mes', qty: 1, price: 2745652, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'OFICIAL ACABADOS', unit: 'Mes', qty: 1, price: 2745652, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'OFICIAL ELECTRICO', unit: 'Mes', qty: 1, price: 2745652, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'JORNALES X EVENTOS', unit: 'Und', qty: 60, price: 60000, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    { name: 'HORAS EXTRAS', unit: 'GB', qty: 5, price: 2909467, rubro: 'NÓMINA', category: 'OPERATIVOS' },
    
    // NOMINA - CONDUCTORES
    { name: 'Conductor RAM', unit: 'Und', qty: 1, price: 3809883, rubro: 'NÓMINA', category: 'CONDUCTORES' },
    { name: 'Conductor Camion/Volqueta', unit: 'Und', qty: 1, price: 2939675, rubro: 'NÓMINA', category: 'CONDUCTORES' },
    { name: 'Operador Tractor', unit: 'Und', qty: 1, price: 2857143, rubro: 'NÓMINA', category: 'CONDUCTORES' },

    // NOMINA - ADMINISTRATIVOS
    { name: 'Director', unit: 'Mes', qty: 0, price: 0, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },
    { name: 'Administrador de Proyectos', unit: 'Mes', qty: 1, price: 6858955, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },
    { name: 'Coordinador Administrativo', unit: 'Mes', qty: 0, price: 0, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },
    { name: 'Coordinador Operativo', unit: 'Mes', qty: 1, price: 4578460, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },
    { name: 'Jefe de Logìstica', unit: 'Mes', qty: 1, price: 3865855, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },
    { name: 'Asistente', unit: 'Mes', qty: 1, price: 2972770, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },
    { name: 'Auxiliar', unit: 'Mes', qty: 0, price: 0, rubro: 'NÓMINA', category: 'ADMINISTRATIVOS' },

    // INSUMOS - FERTILIZANTES
    { name: 'COMPOST X 40KG', unit: 'Bt', qty: 0, price: 10520, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'TRADICION CAFETERA (KG)', unit: 'Kg', qty: 0, price: 3594, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'HIDROCOMPLEX (KG)', unit: 'Kg', qty: 0, price: 3766, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'TRIPLE 15 (KG)', unit: 'Kg', qty: 0, price: 3550, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'AGRIMINS FOLIAR COMPLETO X LITRO', unit: 'Lt', qty: 0, price: 34800, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'TERRA SORB RADICULAR X 1', unit: 'Lt', qty: 0, price: 37600, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'SULFATO DE AMONIO', unit: 'Bt', qty: 0, price: 144800, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'CRECIFOL', unit: 'Lts', qty: 0, price: 30400, rubro: 'INSUMOS', category: 'FERTILIZANTES' },
    { name: 'HUMUS', unit: 'Kg', qty: 0, price: 680, rubro: 'INSUMOS', category: 'FERTILIZANTES' },

    // INSUMOS - HERBICIDAS
    { name: 'DESTIERRO (LTS)', unit: 'Lts', qty: 0, price: 57300, rubro: 'INSUMOS', category: 'HERBICIDAS' },
    { name: 'ROUNDUP (LTS)', unit: 'Lts', qty: 4, price: 28000, rubro: 'INSUMOS', category: 'HERBICIDAS' },
    { name: 'TROPICO (LTS)', unit: 'Lts', qty: 0, price: 21365, rubro: 'INSUMOS', category: 'HERBICIDAS' },
];

async function main() {
    console.log("Fetching boards...");
    const { data: boards } = await supabase.from('boards').select('*').order('created_at', { ascending: false });
    if (!boards || boards.length === 0) {
        console.log("No boards found.");
        return;
    }

    const targetBoard = boards[0];
    console.log(`Using target board: ${targetBoard.name} (${targetBoard.id})`);

    const { data: groups } = await supabase.from('groups').select('*').eq('board_id', targetBoard.id).order('position', { ascending: true });
    
    let targetGroup;
    if (!groups || groups.length === 0) {
        console.log("No groups found for board, creating one...");
        const { data: newGroup } = await supabase.from('groups').insert([{
            board_id: targetBoard.id,
            title: 'General',
            position: 0,
            color: '#00cff4'
        }]).select();
        targetGroup = newGroup[0];
    } else {
        targetGroup = groups[0];
    }

    console.log(`Injecting data into group: ${targetGroup.title} (${targetGroup.id})`);

    for (let i = 0; i < itemsToInsert.length; i++) {
        const item = itemsToInsert[i];
        
        // check if exists
        const { data: existing } = await supabase.from('items')
            .select('id')
            .eq('group_id', targetGroup.id)
            .ilike('name', item.name);
            
        if (existing && existing.length > 0) {
            console.log(`Item already exists: ${item.name}`);
            continue;
        }
        
        await supabase.from('items').insert([{
            group_id: targetGroup.id,
            name: item.name,
            position: i,
            values: {
                item_type: 'financial',
                rubro: item.rubro,
                category: item.category,
                sub_category: 'General',
                unit: item.unit,
                cant: item.qty,
                unit_price: item.price,
                executed_qty: 0,
                daily_execution: {},
                observaciones: ''
            }
        }]);
        console.log(`Inserted: ${item.name}`);
    }
    
    console.log("Done.");
}

main().catch(console.error);
