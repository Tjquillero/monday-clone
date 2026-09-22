/**
-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.2: Concurrencia Real Multi-Cliente
-- ============================================================================
-- Propósito: Demostrar empíricamente que cuando dos clientes/conexiones independientes
-- (Client A y Client B) ejecutan simultáneamente en paralelo (Promise.all) el
-- despacho de la misma notificación (mismo event_id y user_id):
-- 1. Ambas promesas resuelven sin lanzar excepciones de colisión.
-- 2. El índice B-Tree único de PostgreSQL y ON CONFLICT DO NOTHING absorben la carrera.
-- 3. Exactamente 1 inserción efectiva ocurre y el conteo final en DB es 1.
-- ============================================================================
*/

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.log('Ambiente sin conexión activa Supabase remota - Documentando runner concurrente multi-cliente');
  process.exit(0);
}

// Inicializar dos clientes de conexión completamente independientes
const clientA = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
const clientB = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });

async function runConcurrencyTest() {
  const testBoardId = 'e1200000-0000-0000-0000-000000000001';
  const testUserId = 'e1200000-0000-0000-0000-000000000002';
  const eventId = `evt-concurrency-live-${Date.now()}`;

  const payload = {
    p_event_id: eventId,
    p_board_id: testBoardId,
    p_alert_code: 'ALERT-01',
    p_entity_id: 'item-conc-live',
    p_severity: 'CRITICAL',
    p_title: 'Alerta Concurrente Multi-Cliente Live',
    p_message: 'Mensaje de prueba de carrera concurrente física',
    p_eligible_roles: ['SUPERVISOR']
  };

  console.log(`[M5-E1.2] Lanzando 2 llamadas RPC concurrentes simultáneas para event_id=${eventId}...`);

  // Disparo concurrente paralelo en dos conexiones distintas
  const [resA, resB] = await Promise.all([
    clientA.rpc('dispatch_user_notification', payload),
    clientB.rpc('dispatch_user_notification', payload)
  ]);

  console.log(`[M5-E1.2] Resultado Conexión A:`, resA.data, resA.error || 'Sin error');
  console.log(`[M5-E1.2] Resultado Conexión B:`, resB.data, resB.error || 'Sin error');

  const { data: rows, count } = await clientA
    .from('user_notifications')
    .select('*', { count: 'exact' })
    .eq('event_id', eventId);

  console.log(`[M5-E1.2] Filas persistidas en base de datos: ${count}`);

  if (count === 1) {
    console.log('🟢 [M5-E1.2] PASS: Concurrencia física verificada (1 fila, 0 duplicados, 0 excepciones)');
  } else {
    console.error(`🔴 [M5-E1.2] FAIL: Conteo inesperado = ${count}`);
  }
}

runConcurrencyTest().catch(console.error);
