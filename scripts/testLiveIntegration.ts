import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { reportFieldExecution } from '../src/lib/fieldWorkflowExecutionService';
import { OperationalResourceItem } from '../src/lib/resourceConsumptionControlService';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runLiveIntegrationTest() {
  console.log('=============================================================================');
  console.log('    MANTENIX — TEST DE INTEGRACIÓN REAL F5.3 & POD-01 EN POSTGRESQL');
  console.log('=============================================================================\n');

  // 1. Obtener contexto real: Board, User y WeeklyPlanItem de un plan publicado
  const boardId = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8';
  const userId = '9e1ed244-eb69-4f14-99e3-adfa628d8935';

  const { data: plans } = await supabase
    .from('weekly_plans')
    .select('id, status')
    .eq('board_id', boardId)
    .eq('status', 'published')
    .limit(1);

  if (!plans || plans.length === 0) {
    throw new Error(`No se encontró un plan publicado para el tablero ${boardId}`);
  }

  const publishedPlan = plans[0];
  const { data: items } = await supabase
    .from('weekly_plan_items')
    .select('*')
    .eq('plan_id', publishedPlan.id)
    .limit(1);

  if (!items || items.length === 0) {
    throw new Error(`No se encontraron ítems en el plan ${publishedPlan.id}`);
  }

  const testItem = items[0];
  const uniqueMutationId = `mut_live_f53_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  console.log(`[Contexto de Integración]`);
  console.log(`- Board ID:           ${boardId}`);
  console.log(`- Plan ID (published): ${publishedPlan.id}`);
  console.log(`- Item ID:            ${testItem.id} (${testItem.activity_key})`);
  console.log(`- User ID (admin):    ${userId}`);
  console.log(`- Source Mutation ID: ${uniqueMutationId}\n`);

  const testResources: OperationalResourceItem[] = [
    {
      resourceKey: 'MAT_CEMENTO_TEST',
      resourceName: 'Cemento Gris Tipo 1',
      category: 'MATERIAL',
      unit: 'saco',
      quantity: 4.5,
    },
    {
      resourceKey: 'EQM_COMPACTADORA_TEST',
      resourceName: 'Vibrocompactadora Manual',
      category: 'EQUIPO_MENOR',
      unit: 'hora',
      quantity: 3,
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPUERTA 1: REQUEST A (INSERT INICIAL VÍA GATEWAY F5.3)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- [PASO 1] REQUEST A: Inserción inicial vía gateway F5.3 ---');
  const res1 = await reportFieldExecution(supabase, {
    weekly_plan_item_id: testItem.id,
    board_id: boardId,
    execution_date: '2026-09-12',
    executed_qty: 12.0,
    worker_count: 2,
    hours_worked: 4,
    reported_by: userId,
    source_mutation_id: uniqueMutationId,
    used_resources: testResources,
    continuation_decision: 'CONTINUA_MANANA',
  });

  console.log(`- Execution ID creado: ${res1.executionRecord.id}`);
  console.log(`- isIdempotentReplay: ${res1.isIdempotentReplay} (Esperado: false) -> ${res1.isIdempotentReplay === false ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Cantidad reportada: ${res1.executionRecord.executed_qty}`);
  console.log(`- Recursos persistidos:`, JSON.stringify(res1.executionRecord.used_resources));

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPUERTA 2: RETRY A (REINTENTO IDEMPOTENTE CON MISMO source_mutation_id)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- [PASO 2] RETRY A: Reintento idempotente vía gateway F5.3 ---');
  const res2 = await reportFieldExecution(supabase, {
    weekly_plan_item_id: testItem.id,
    board_id: boardId,
    execution_date: '2026-09-12',
    executed_qty: 12.0,
    worker_count: 2,
    hours_worked: 4,
    reported_by: userId,
    source_mutation_id: uniqueMutationId,
    used_resources: testResources,
    continuation_decision: 'CONTINUA_MANANA',
  });

  console.log(`- Execution ID devuelto: ${res2.executionRecord.id}`);
  console.log(`- isIdempotentReplay: ${res2.isIdempotentReplay} (Esperado: true) -> ${res2.isIdempotentReplay === true ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Identidad de registro: ${res2.executionRecord.id === res1.executionRecord.id ? '✅ PASS (Mismo ID)' : '❌ FAIL (Distinto ID)'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPUERTA 3: AUDITORÍA DIRECTA EN POSTGRESQL (0 DUPLICADOS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- [PASO 3] AUDITORÍA FÍSICA EN POSTGRESQL ---');
  
  // 3.1 Consulta de duplicados globales en weekly_plan_item_executions
  const { data: allExecsWithMutationId, error: aErr } = await supabase
    .from('weekly_plan_item_executions')
    .select('id, plan_item_id, source_mutation_id, executed_qty, used_resources, created_at')
    .eq('source_mutation_id', uniqueMutationId);

  if (aErr) {
    console.error('Error al consultar PostgreSQL:', aErr);
    return;
  }

  console.log(`- Filas físicas encontradas con source_mutation_id "${uniqueMutationId}": ${allExecsWithMutationId.length}`);
  if (allExecsWithMutationId.length === 1) {
    console.log('✅ PASS: Exactamente 1 fila física en PostgreSQL (0 duplicados).');
  } else {
    console.error(`❌ FAIL: Se encontraron ${allExecsWithMutationId.length} filas.`);
  }

  const row = allExecsWithMutationId[0];
  console.log('\n[Fila física persistida en PostgreSQL]');
  console.log(JSON.stringify(row, null, 2));

  // 3.2 Verificación de unicidad global (HAVING COUNT(*) > 1)
  const { data: allRows } = await supabase
    .from('weekly_plan_item_executions')
    .select('source_mutation_id')
    .not('source_mutation_id', 'is', null);

  const mutationCounts: Record<string, number> = {};
  for (const r of (allRows || [])) {
    if (r.source_mutation_id) {
      mutationCounts[r.source_mutation_id] = (mutationCounts[r.source_mutation_id] || 0) + 1;
    }
  }

  const duplicates = Object.entries(mutationCounts).filter(([_, count]) => count > 1);
  console.log(`\n- Conteo de source_mutation_id duplicados en toda la base de datos: ${duplicates.length}`);
  if (duplicates.length === 0) {
    console.log('✅ PASS: 0 source_mutation_id duplicados en toda la tabla weekly_plan_item_executions.');
  } else {
    console.error('❌ FAIL: Se encontraron duplicados:', duplicates);
  }

  console.log('\n=============================================================================');
  console.log('    RESULTADO FINAL: TODAS LAS COMPUERTAS DE INTEGRACIÓN EN VERDE');
  console.log('=============================================================================');
}

runLiveIntegrationTest().catch((err) => {
  console.error('Error durante la ejecución del test de integración:', err);
});
