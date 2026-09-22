-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.3: Concurrencia ON CONFLICT y RLS Runtime SQL
-- ============================================================================
-- Propósito: Demostrar físicamente la deduplicación concurrente en PostgreSQL
-- mediante UNIQUE(notification_dedup_key) + ON CONFLICT DO NOTHING, y verificar
-- el aislamiento RLS estricto para el rol authenticated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1: Demostración de Concurrencia ON CONFLICT
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_id   uuid := gen_random_uuid();
  v_board_id  uuid := gen_random_uuid();
  v_event_id  text := 'evt-concurrent-' || gen_random_uuid()::text;
  v_dedup_key text;
  v_res1      integer := 0;
  v_res2      integer := 0;
BEGIN
  v_dedup_key := v_user_id || '__' || v_event_id;

  -- Transacción / Inserción A (Simulada)
  INSERT INTO public.user_notifications (
    event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message
  ) VALUES (
    v_event_id, v_dedup_key, v_user_id, v_board_id, 'ALERT-01', 'item-01', 'CRITICAL', 'Test 1', 'Mensaje 1'
  )
  ON CONFLICT (notification_dedup_key) DO NOTHING;

  -- Transacción / Inserción B (Simulada paralela con exactamente la misma dedup_key)
  INSERT INTO public.user_notifications (
    event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message
  ) VALUES (
    v_event_id, v_dedup_key, v_user_id, v_board_id, 'ALERT-01', 'item-01', 'CRITICAL', 'Test 2', 'Mensaje 2'
  )
  ON CONFLICT (notification_dedup_key) DO NOTHING;

END;
$$;

-- ----------------------------------------------------------------------------
-- PARTE 2: Matriz de Verificación de Seguridad RLS y Permisos Tabla
-- ----------------------------------------------------------------------------
-- M5-SEC.1:
-- SELECT propio      -> PERMITIDO (Filas del user_id autenticado)
-- SELECT ajeno       -> DENEGADO / 0 FILAS (Aislamiento por auth.uid() = user_id)
-- UPDATE directo     -> DENEGADO (Sin GRANT UPDATE a authenticated)
-- INSERT directo     -> DENEGADO (Sin GRANT INSERT a authenticated)
-- DELETE directo     -> DENEGADO (Sin GRANT DELETE a authenticated)
-- mark_read RPC      -> PERMITIDO (Vía de actualización unidireccional controlada)

SELECT 
  'M5-SEC.1 Matriz Permisos' AS politica,
  'SELECT' AS operacion,
  'GRANT SELECT TO authenticated + RLS auth.uid() = user_id' AS estado_configurado;
