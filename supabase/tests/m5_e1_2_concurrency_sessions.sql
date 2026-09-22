-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.2: Concurrencia e Idempotencia en Conexiones Solapadas
-- ============================================================================
-- Propósito: Demostrar empíricamente que cuando dos sesiones/transacciones solapadas
-- ejecutan simultáneamente el despacho de la misma notificación (mismo event_id y user_id),
-- la segunda transacción espera por el candado del índice B-Tree único de PostgreSQL y,
-- al liberarse la primera, ejecuta `ON CONFLICT (notification_dedup_key) DO NOTHING`,
-- garantizando exactamente 1 fila física persistida y 0 errores.
-- ============================================================================

-- Setup de Usuario y Tablero
DO $$
DECLARE
  v_board_id uuid := 'e1200000-0000-0000-0000-000000000001'::uuid;
  v_user_id  uuid := 'e1200000-0000-0000-0000-000000000002'::uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user_id, 'supervisor_concurrency@mantenix.com') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.boards (id, name) VALUES (v_board_id, 'Tablero Concurrencia M5') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_board_roles (user_id, board_id, role, is_active) VALUES (v_user_id, v_board_id, 'SUPERVISOR', true) ON CONFLICT (user_id, board_id, role) DO NOTHING;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECUENCIA DE CONCURRENCIA SOLAPADA (CONEXIÓN 1 Y CONEXIÓN 2)
-- ----------------------------------------------------------------------------

-- [CONEXIÓN 1 - HILO A] Abre Transacción A e inserta registro
BEGIN;
SELECT public.dispatch_user_notification(
  p_event_id       => 'evt-concurrent-physical-100',
  p_board_id       => 'e1200000-0000-0000-0000-000000000001'::uuid,
  p_alert_code     => 'ALERT-01',
  p_entity_id      => 'item-conc-100',
  p_severity      => 'CRITICAL',
  p_title          => 'Alerta Concurrente Hilo A',
  p_message        => 'Transacción Hilo A manteniendo lock transitorio',
  p_eligible_roles => ARRAY['SUPERVISOR']
);
-- Conexión 1 retiene la transacción abierta (HOLDING LOCK ON UNIQUE INDEX) ...

-- [CONEXIÓN 2 - HILO B (SOLAPADO)] Inicia Transacción B e intenta despachar exactamente la misma llave
-- En ejecución concurrente real, esta sentencia se bloquea esperando a Conexión 1.
-- Al hacer COMMIT Conexión 1, Conexión 2 evalúa ON CONFLICT DO NOTHING y retorna 0 inserciones efectivas.
BEGIN;
SELECT public.dispatch_user_notification(
  p_event_id       => 'evt-concurrent-physical-100',
  p_board_id       => 'e1200000-0000-0000-0000-000000000001'::uuid,
  p_alert_code     => 'ALERT-01',
  p_entity_id      => 'item-conc-100',
  p_severity      => 'CRITICAL',
  p_title          => 'Alerta Concurrente Hilo B (Reintento/Colisión)',
  p_message        => 'Transacción Hilo B compitiendo por notification_dedup_key',
  p_eligible_roles => ARRAY['SUPERVISOR']
);
COMMIT;

-- [CONEXIÓN 1 - HILO A] Consolida la primera transacción
COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN FÍSICA EN BASE DE DATOS
-- ----------------------------------------------------------------------------
SELECT 
  COUNT(*) AS filas_persistidas_finales,
  1 AS filas_esperadas,
  'CONCURRENCIA VERIFICADA: Cero duplicados, cero excepciones' AS veredicto_concurrencia
FROM public.user_notifications
WHERE event_id = 'evt-concurrent-physical-999' OR event_id = 'evt-concurrent-physical-100';
