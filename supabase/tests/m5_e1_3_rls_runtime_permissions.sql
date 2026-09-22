-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.3: Matriz Runtime RLS y Permisos Ejecutada
-- ============================================================================
-- Propósito: Demostrar empíricamente dentro de PostgreSQL que bajo el rol
-- `authenticated` con contexto de JWT activo (`auth.uid()`):
-- 1. `auth.uid()` se evalúa al UUID exacto del usuario autenticado.
-- 2. `SELECT` únicamente devuelve notificaciones propias (`auth.uid() = user_id`).
-- 3. `INSERT` directo es bloqueado con error 42501 (permission_denied).
-- 4. `UPDATE` directo es bloqueado con error 42501 (permission_denied).
-- 5. `DELETE` directo es bloqueado con error 42501 (permission_denied).
-- 6. `mark_notification_read(uuid)` RPC transiciona `is_read = true` para filas propias.
-- 7. `mark_notification_read(uuid)` RPC sobre notificaciones de OTRO usuario NO altera su estado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 1: Setup Previo de Usuarios A y B y Sembrado de Notificaciones Fieles
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := 'e1300000-0000-0000-0000-000000000001'::uuid;
  v_user_b uuid := 'e1300000-0000-0000-0000-000000000002'::uuid;
  v_board  uuid := 'e1300000-0000-0000-0000-000000000003'::uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user_a, 'user_a_rls@mantenix.com') ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (v_user_b, 'user_b_rls@mantenix.com') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.boards (id, name) VALUES (v_board, 'Tablero RLS Runtime Matrix') ON CONFLICT (id) DO NOTHING;

  -- Sembrar 1 notificación para User A
  INSERT INTO public.user_notifications (
    id, event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message, is_read
  ) VALUES (
    '11111111-1111-1111-1111-111111111111'::uuid, 'evt-rls-exec-a', 'user_a__evt-rls-exec-a', v_user_a, v_board, 'ALERT-01', 'item-a', 'HIGH', 'Notif A', 'Mensaje A', false
  ) ON CONFLICT (notification_dedup_key) DO NOTHING;

  -- Sembrar 1 notificación para User B
  INSERT INTO public.user_notifications (
    id, event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message, is_read
  ) VALUES (
    '22222222-2222-2222-2222-222222222222'::uuid, 'evt-rls-exec-b', 'user_b__evt-rls-exec-b', v_user_b, v_board, 'ALERT-01', 'item-b', 'HIGH', 'Notif B', 'Mensaje B', false
  ) ON CONFLICT (notification_dedup_key) DO NOTHING;
END;
$$;

-- ----------------------------------------------------------------------------
-- PASO 2: Ejecución de la Matriz de Pruebas Runtime bajo Rol Authenticated (User A)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a       uuid := 'e1300000-0000-0000-0000-000000000001'::uuid;
  v_user_b       uuid := 'e1300000-0000-0000-0000-000000000002'::uuid;
  v_count_own    integer;
  v_count_other  integer;
  v_is_read_a    boolean;
  v_is_read_b    boolean;
  v_err_captured boolean := false;
BEGIN
  -- Establecer contexto JWT y rol autenticado en PostgreSQL
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', '{"sub": "e1300000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', 'e1300000-0000-0000-0000-000000000001', true);

  -- TEST 1: Verificar que auth.uid() coincide exactamente con User A
  IF auth.uid() IS DISTINCT FROM v_user_a THEN
    RAISE EXCEPTION 'TEST 1 FALLÓ: auth.uid() no retornó el UUID esperado de User A';
  END IF;
  RAISE NOTICE 'TEST 1 PASS: auth.uid() = %', auth.uid();

  -- TEST 2: SELECT propio vs ajeno (Aislamiento RLS)
  SELECT COUNT(*) INTO v_count_own FROM public.user_notifications WHERE user_id = v_user_a;
  SELECT COUNT(*) INTO v_count_other FROM public.user_notifications WHERE user_id = v_user_b;

  IF v_count_own < 1 THEN
    RAISE EXCEPTION 'TEST 2 FALLÓ: SELECT propio no retornó la notificación de User A';
  END IF;

  IF v_count_other > 0 THEN
    RAISE EXCEPTION 'TEST 2 FALLÓ: SELECT retornó notificaciones de User B a User A (Fallo de RLS)';
  END IF;
  RAISE NOTICE 'TEST 2 PASS: RLS Aisló lectura (Propio = %, Ajeno = 0)', v_count_own;

  -- TEST 3: INSERT Directo Denegado (Must catch SQLSTATE 42501 / insufficient_privilege)
  v_err_captured := false;
  BEGIN
    INSERT INTO public.user_notifications (
      event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message
    ) VALUES (
      'evt-direct-ins', 'direct-key', v_user_a, 'e1300000-0000-0000-0000-000000000003'::uuid, 'ALERT-01', 'item-x', 'LOW', 'Direct', 'Direct'
    );
  EXCEPTION WHEN SQLSTATE '42501' OR insufficient_privilege THEN
    v_err_captured := true;
  END;

  IF NOT v_err_captured THEN
    RAISE EXCEPTION 'TEST 3 FALLÓ: INSERT directo no fue denegado por M5-SEC.1';
  END IF;
  RAISE NOTICE 'TEST 3 PASS: INSERT directo fue rechazado con error 42501 (permission_denied)';

  -- TEST 4: UPDATE Directo Denegado
  v_err_captured := false;
  BEGIN
    UPDATE public.user_notifications SET is_read = true WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;
  EXCEPTION WHEN SQLSTATE '42501' OR insufficient_privilege THEN
    v_err_captured := true;
  END;

  IF NOT v_err_captured THEN
    RAISE EXCEPTION 'TEST 4 FALLÓ: UPDATE directo no fue denegado por M5-SEC.1';
  END IF;
  RAISE NOTICE 'TEST 4 PASS: UPDATE directo fue rechazado con error 42501 (permission_denied)';

  -- TEST 5: DELETE Directo Denegado
  v_err_captured := false;
  BEGIN
    DELETE FROM public.user_notifications WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;
  EXCEPTION WHEN SQLSTATE '42501' OR insufficient_privilege THEN
    v_err_captured := true;
  END;

  IF NOT v_err_captured THEN
    RAISE EXCEPTION 'TEST 5 FALLÓ: DELETE directo no fue denegado por M5-SEC.1';
  END IF;
  RAISE NOTICE 'TEST 5 PASS: DELETE directo fue rechazado con error 42501 (permission_denied)';

  -- TEST 6: Transición Autorizada vía RPC mark_notification_read sobre fila propia (User A)
  PERFORM public.mark_notification_read('11111111-1111-1111-1111-111111111111'::uuid);
  
  SELECT is_read INTO v_is_read_a FROM public.user_notifications WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;
  IF NOT v_is_read_a THEN
    RAISE EXCEPTION 'TEST 6 FALLÓ: mark_notification_read RPC no actualizó la notificación de User A';
  END IF;
  RAISE NOTICE 'TEST 6 PASS: RPC mark_notification_read actualizó exitosamente la notificación de User A';

  -- TEST 7: Intento de mark_notification_read sobre la notificación de User B por User A
  PERFORM public.mark_notification_read('22222222-2222-2222-2222-222222222222'::uuid);
  
  -- Restablecer temporalmente contexto para verificar estado de User B
  RESET ROLE;
  SELECT is_read INTO v_is_read_b FROM public.user_notifications WHERE id = '22222222-2222-2222-2222-222222222222'::uuid;
  IF v_is_read_b THEN
    RAISE EXCEPTION 'TEST 7 FALLÓ: User A logró marcar como leída la notificación de User B vía RPC';
  END IF;
  RAISE NOTICE 'TEST 7 PASS: RPC impidió que User A modificara la notificación de User B';
END;
$$;
