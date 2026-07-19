-- =============================================================================
-- Tests: gate de evidencia en confirm_weekly_plan
--
-- CONTRATO DEL DOMINIO: docs/architecture/execution-certification-design.md,
-- sección 5. Este archivo es su especificación ejecutable.
--
-- Contrato verificado:
--   - El gate evalúa solo ejecuciones en estado 'verified' del plan (NO
--     'reported' — el gate previo ya exige 0 'reported' antes de este punto).
--   - Cada 'verified' debe tener >= 1 fila en execution_attachments.
--   - 'draft' y 'rejected' no participan (no bloquean, no se exige evidencia).
--   - Una sola evidencia basta — no hay mínimo mayor a 1.
--   - Error estructurado: ERRCODE = 'MEVID', DETAIL en JSON con las
--     ejecuciones bloqueantes, MESSAGE legible con el conteo exacto.
--
-- Sin SAVEPOINT/ROLLBACK TO por test: como ya documentó 01_state_machine.sql
-- (tests 37+), ROLLBACK TO revierte el contador interno de pgTAP y produce
-- el diagnóstico falso "planned N but ran 0" en finish(). Cada test usa su
-- propio week_start + activity_key para no colisionar con los demás; el
-- ROLLBACK final limpia todo.
--
-- Los helpers (_test_set_user, _test_seed_poa_activity_zone) se redefinen
-- aquí porque 01_state_machine.sql los crea dentro de su propia transacción,
-- que se revierte al final — no persisten entre archivos de test.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/02_evidence_gate.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(6);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures compartidos — board/grupo propios de este archivo (prefijo eeee/ffff
-- para no depender de que 01_state_machine.sql haya corrido o no en la misma
-- sesión).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'Test Board Evidence Gate', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'Sitio Evidence Gate', '#0000FF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'leader'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'supervisor')
ON CONFLICT (board_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_set_user(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user_id)::TEXT, true);
$$;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_zone(
  p_board_id UUID, p_zone_id UUID, p_activity_key TEXT, p_frecuencia NUMERIC,
  p_precio_unitario NUMERIC DEFAULT 100000, p_cantidad_contratada NUMERIC DEFAULT 100000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_zone_row_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, p_frecuencia, p_precio_unitario)
  ON CONFLICT (poa_version_id, activity_key) DO UPDATE SET frecuencia = EXCLUDED.frecuencia
  RETURNING id INTO v_activity_id;

  -- Catálogo técnico del fixture: sin esto, confirm_weekly_plan() rechazaría
  -- TODOS los tests de este archivo con ERRCODE=MTCFG (gate de configuración
  -- técnica, 20260827) — no relacionado con el gate de evidencia que este
  -- archivo prueba, así que se satisface aquí de una vez. Idempotente: solo
  -- inserta si no existe ya una fila vigente para este board+actividad.
  INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
  SELECT p_board_id, p_activity_key, p_activity_key, 'ZONA VERDE', 'und', 100
  WHERE NOT EXISTS (
    SELECT 1 FROM public.board_activity_standards
    WHERE board_id = p_board_id AND activity_key = p_activity_key AND effective_to IS NULL
  );

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_zone_id, p_cantidad_contratada)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada
  RETURNING id INTO v_zone_row_id;

  RETURN v_zone_row_id;
END;
$$;

-- Helper: crea un plan 'in_progress' con 1 item y 1 execution en el estado
-- pedido. Devuelve (plan_id, execution_id) vía OUT params.
CREATE OR REPLACE FUNCTION _test_seed_plan_with_execution(
  p_week_start DATE, p_activity_key TEXT, p_exec_status TEXT,
  OUT o_plan_id UUID, OUT o_execution_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
  v_paz_id UUID; v_item_id UUID;
  v_started TIMESTAMPTZ := (p_week_start::TEXT || ' 07:00:00')::TIMESTAMPTZ;
  v_finished TIMESTAMPTZ := (p_week_start::TEXT || ' 15:00:00')::TIMESTAMPTZ;
BEGIN
  v_paz_id := _test_seed_poa_activity_zone(
    'eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', p_activity_key, 4
  );

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001',
          p_week_start, 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO o_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (o_plan_id, 1, p_activity_key, v_paz_id, 10, 4, 'preferred', 100, 'und', 2.5)
  RETURNING id INTO v_item_id;

  IF p_exec_status = 'draft' THEN
    INSERT INTO public.weekly_plan_item_executions
      (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
    VALUES (v_item_id, p_week_start, 2, v_started, v_finished, 50, 'draft', 'aaaaaaaa-0000-0000-0000-000000000003')
    RETURNING id INTO o_execution_id;
  ELSIF p_exec_status = 'rejected' THEN
    INSERT INTO public.weekly_plan_item_executions
      (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, rejection_notes, created_by)
    VALUES (v_item_id, p_week_start, 2, v_started, v_finished, 50, 'rejected', 'Motivo de prueba', 'aaaaaaaa-0000-0000-0000-000000000003')
    RETURNING id INTO o_execution_id;
  ELSIF p_exec_status = 'verified' THEN
    INSERT INTO public.weekly_plan_item_executions
      (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
    VALUES (v_item_id, p_week_start, 2, v_started, v_finished, 50, 'verified', 'aaaaaaaa-0000-0000-0000-000000000004', NOW(), 'aaaaaaaa-0000-0000-0000-000000000003')
    RETURNING id INTO o_execution_id;
  ELSE
    RAISE EXCEPTION 'estado no soportado por el fixture: %', p_exec_status;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: verified CON evidencia → confirm permitido
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_plan_with_execution('2026-08-03', 'GATE_ACT_001', 'verified');

  INSERT INTO public.execution_attachments (execution_id, file_name, file_url)
  VALUES (v_exec_id, 'foto.jpg', 'https://example.com/foto.jpg');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002'); -- assistant
  PERFORM public.confirm_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE board_id = 'eeeeeeee-0000-0000-0000-000000000001' AND week_start = '2026-08-03'),
  'confirmed',
  'Test 1: verified con evidencia (1 foto) → confirm permitido ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: verified SIN evidencia → confirm rechazado con ERRCODE MEVID
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID; v_ok BOOLEAN := FALSE; v_sqlstate TEXT; v_msg TEXT;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_plan_with_execution('2026-08-10', 'GATE_ACT_002', 'verified');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.confirm_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_ok := (v_sqlstate = 'MEVID' AND v_msg LIKE '%1 jornada%');
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 2: debió fallar con ERRCODE=MEVID y mensaje "1 jornada"; sqlstate=%, msg=%', v_sqlstate, v_msg;
  END IF;
END;
$$;

SELECT pass('Test 2: verified sin evidencia → confirm rechazado con ERRCODE=MEVID y conteo exacto ✓');

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: draft no bloquea (sin evidencia, pero no participa del gate)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_plan_with_execution('2026-08-17', 'GATE_ACT_003', 'draft');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  PERFORM public.confirm_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE board_id = 'eeeeeeee-0000-0000-0000-000000000001' AND week_start = '2026-08-17'),
  'confirmed',
  'Test 3: ejecución draft sin evidencia no bloquea el confirm ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: rejected no bloquea (sin evidencia, pero no participa del gate)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_plan_with_execution('2026-08-24', 'GATE_ACT_004', 'rejected');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  PERFORM public.confirm_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE board_id = 'eeeeeeee-0000-0000-0000-000000000001' AND week_start = '2026-08-24'),
  'confirmed',
  'Test 4: ejecución rejected sin evidencia no bloquea el confirm ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: una sola evidencia basta (no exige un mínimo mayor a 1)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_plan_with_execution('2026-08-31', 'GATE_ACT_005', 'verified');

  INSERT INTO public.execution_attachments (execution_id, file_name, file_url)
  VALUES (v_exec_id, 'unica.jpg', 'https://example.com/unica.jpg');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  PERFORM public.confirm_weekly_plan(v_plan_id); -- no debe lanzar excepción
END;
$$;

SELECT pass('Test 5: una sola evidencia es suficiente — confirm no exige un mínimo mayor a 1 ✓');

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: DETAIL contiene el execution_id exacto de la jornada bloqueante
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID; v_detail TEXT; v_ok BOOLEAN := FALSE;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_plan_with_execution('2026-09-07', 'GATE_ACT_006', 'verified');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.confirm_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    v_ok := v_detail LIKE '%' || v_exec_id::TEXT || '%';
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 6: DETAIL debía contener execution_id %; detail=%', v_exec_id, v_detail;
  END IF;
END;
$$;

SELECT pass('Test 6: DETAIL identifica exactamente la ejecución bloqueante (no un mensaje genérico) ✓');

SELECT * FROM finish();
ROLLBACK;
