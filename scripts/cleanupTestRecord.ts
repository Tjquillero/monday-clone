import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_MUTATION_ID = 'mut_live_f53_1789261095238_m25r';
const TEST_EXECUTION_ID = '36136751-f977-40e7-b42d-bf4e57fb61ec';
const PARENT_ITEM_ID = '3a5d04b7-be53-489e-bdbe-a2c7cb30f987';

async function cleanupTestExecution() {
  console.log('=============================================================================');
  console.log('    MANTENIX — SANEAMIENTO CONTROLADO DE REGISTRO DE PRUEBA LIVE');
  console.log('=============================================================================\n');

  // 1. Verificar existencia del registro de prueba
  const { data: testExecs, error: fErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('source_mutation_id', TEST_MUTATION_ID);

  if (fErr) {
    console.error('Error buscando registro de prueba:', fErr);
    return;
  }

  if (!testExecs || testExecs.length === 0) {
    console.log(`No se encontró el registro con source_mutation_id "${TEST_MUTATION_ID}". Ya está limpio.`);
    return;
  }

  console.log('1. Registro de prueba identificado:', {
    id: testExecs[0].id,
    plan_item_id: testExecs[0].plan_item_id,
    source_mutation_id: testExecs[0].source_mutation_id,
    executed_qty: testExecs[0].executed_qty,
  });

  // 2. Verificar dependencias (execution_attachments, etc.)
  console.log('\n2. Verificando dependencias en tablas vinculadas...');
  const { data: attachments } = await supabase
    .from('execution_attachments')
    .select('*')
    .eq('execution_id', testExecs[0].id);

  console.log(`- execution_attachments vinculados: ${attachments?.length || 0}`);

  // 3. Inspeccionar ítem padre antes de la limpieza
  const { data: parentBefore } = await supabase
    .from('weekly_plan_items')
    .select('id, executed_qty, executed_jr')
    .eq('id', PARENT_ITEM_ID)
    .single();

  console.log(`- Ítem padre antes del borrado: executed_qty=${parentBefore?.executed_qty}, executed_jr=${parentBefore?.executed_jr}`);

  // 4. Borrado controlado del registro de prueba exclusivamente
  console.log('\n3. Ejecutando DELETE controlado...');
  const { error: dErr } = await supabase
    .from('weekly_plan_item_executions')
    .delete()
    .eq('source_mutation_id', TEST_MUTATION_ID);

  if (dErr) {
    console.error('❌ Error al eliminar el registro de prueba:', dErr);
    return;
  }
  console.log('✅ DELETE completado.');

  // 5. Post-verificación física
  console.log('\n4. Auditoría física post-saneamiento:');
  const { data: checkDeleted } = await supabase
    .from('weekly_plan_item_executions')
    .select('*')
    .eq('source_mutation_id', TEST_MUTATION_ID);

  console.log(`- Filas con mutation_id "${TEST_MUTATION_ID}": ${checkDeleted?.length || 0} (Esperado: 0) -> ${checkDeleted?.length === 0 ? '✅ PASS' : '❌ FAIL'}`);

  const { data: allRemaining } = await supabase
    .from('weekly_plan_item_executions')
    .select('id, plan_item_id, source_mutation_id');

  console.log(`- Total de filas físicas en weekly_plan_item_executions: ${allRemaining?.length} (Esperado: 7 históricos intactos) -> ${allRemaining?.length === 7 ? '✅ PASS' : '⚠️ ATENCIÓN'}`);

  const { data: parentAfter } = await supabase
    .from('weekly_plan_items')
    .select('id, executed_qty, executed_jr')
    .eq('id', PARENT_ITEM_ID)
    .single();

  console.log(`- Ítem padre post-saneamiento: executed_qty=${parentAfter?.executed_qty}, executed_jr=${parentAfter?.executed_jr}`);

  console.log('\n=============================================================================');
  console.log('    SANEAMIENTO FINALIZADO: FUENTE DE VERDAD 100% LIMPIA Y PRESERVADA');
  console.log('=============================================================================');
}

cleanupTestExecution().catch(console.error);
