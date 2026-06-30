-- =============================================================================
-- Tests: Máquina de estados de weekly_plans + triggers
--
-- Cada test corre en su propio bloque SAVEPOINT para aislar fixtures.
-- Todo el archivo está en una transacción que se revierte al final,
-- por lo que no deja datos residuales en la base.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/01_state_machine.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;

-- Escala a postgres (BYPASSRLS) para los fixtures del test.
-- cli_login_postgres puede hacer SET ROLE postgres porque es miembro del rol.
SET ROLE postgres;

-- JWT de sesión (admin) para que auth.uid() funcione en las RPC SECURITY DEFINER.
-- Cada test lo sobrescribe con _test_set_user() a nivel de transacción.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false   -- session-level: no se revierte con ROLLBACK TO SAVEPOINT
);

BEGIN;

SELECT plan(24);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures compartidos
--
-- Usuarios en auth.users creados por 00_setup.sql (requiere postgres/admin).
-- Ejecutar antes de los tests:
--   supabase db query --linked < supabase/tests/00_setup.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Tableau de prueba
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'Test Board SM', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

-- Grupo/sitio de prueba
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Sitio Test', '#00FF00', 0)
ON CONFLICT (id) DO NOTHING;

-- Miembros con diferentes roles
INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'leader'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', 'supervisor'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000005', 'viewer')
ON CONFLICT (board_id, user_id) DO NOTHING;

-- Helper: simula el JWT del usuario admin en la sesión
CREATE OR REPLACE FUNCTION _test_set_user(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user_id)::TEXT, true);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: publish_weekly_plan — happy path (draft → published)
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp1;

DO $$
DECLARE v_plan_id UUID;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-07-07', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');  -- assistant
  PERFORM public.publish_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE week_start = '2026-07-07' AND group_id = 'cccccccc-0000-0000-0000-000000000001'),
  'published',
  'Test 1: draft → published OK'
);

ROLLBACK TO sp1;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: publish_weekly_plan — falla si estado != 'draft'
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp2;

DO $$
DECLARE v_plan_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-07-14', 1, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000001');  -- admin
  BEGIN
    PERFORM public.publish_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 2: debió lanzar excepción'; END IF;
END;
$$;

SELECT pass('Test 2: publish desde confirmed lanza excepción ✓');

ROLLBACK TO sp2;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: publish_weekly_plan — falla si rol es viewer
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp3;

DO $$
DECLARE v_plan_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-07-21', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000005');  -- viewer
  BEGIN
    PERFORM public.publish_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 3: viewer no debería poder publicar'; END IF;
END;
$$;

SELECT pass('Test 3: publish por viewer lanza excepción ✓');

ROLLBACK TO sp3;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: trigger published → in_progress al crear primera ejecución
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp4;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
BEGIN
  -- Estándar mínimo (necesita board_activity_standards)
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_001', 'Actividad Test', 'ZONA VERDE',
     'und', 10, 4, 'must_execute', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  -- Plan en published
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-07-28', 1, 'published', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  -- Item del plan
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_001', v_std_id, 10, 4, 'must_execute', 100, 'und', 2.5)
  RETURNING id INTO v_item_id;

  -- Crear ejecución — debe disparar el trigger
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, created_by)
  VALUES
    (v_item_id, '2026-07-28', 2,
     '2026-07-28T07:00:00Z', '2026-07-28T15:00:00Z', 50,
     'aaaaaaaa-0000-0000-0000-000000000003');
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE week_start = '2026-07-28'
   AND group_id = 'cccccccc-0000-0000-0000-000000000001'),
  'in_progress',
  'Test 4: trigger published → in_progress al crear primera ejecución ✓'
);

ROLLBACK TO sp4;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: trigger fn_sync_plan_item_totals — suma reported + verified
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp5;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
  v_exec1   UUID;
  v_exec2   UUID;
  v_exec3   UUID;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_002', 'Actividad Test 2',
     'ZONA VERDE', 'und', 10, 4, 'preferred', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-04', 2, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_002', v_std_id, 10, 4, 'preferred', 200, 'und', 5)
  RETURNING id INTO v_item_id;

  -- exec1: reported (sí cuenta)
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (v_item_id, '2026-08-04', 2, '2026-08-04T07:00:00Z', '2026-08-04T15:00:00Z',
          60, 'reported', 'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec1;

  -- exec2: verified (sí cuenta) — requires verified_by + verified_at per CHECK constraint
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty,
     status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-08-05', 3, '2026-08-05T07:00:00Z', '2026-08-05T15:00:00Z',
          40, 'verified', 'aaaaaaaa-0000-0000-0000-000000000004', NOW(),
          'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec2;

  -- exec3: draft (NO cuenta)
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (v_item_id, '2026-08-06', 1, '2026-08-06T07:00:00Z', '2026-08-06T15:00:00Z',
          20, 'draft', 'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec3;
END;
$$;

SELECT is(
  (SELECT executed_qty FROM public.weekly_plan_items WHERE plan_id IN (
     SELECT id FROM public.weekly_plans WHERE week_start = '2026-08-04'
     AND group_id = 'cccccccc-0000-0000-0000-000000000001'
   )),
  100::NUMERIC,
  'Test 5a: sync_totals suma reported(60) + verified(40) = 100; draft(20) no cuenta ✓'
);

-- Añadir una ejecución rejected y confirmar que no cambia el total
DO $$
DECLARE
  v_item_id UUID;
BEGIN
  SELECT wpi.id INTO v_item_id
  FROM public.weekly_plan_items wpi
  JOIN public.weekly_plans wp ON wp.id = wpi.plan_id
  WHERE wp.week_start = '2026-08-04'
    AND wp.group_id = 'cccccccc-0000-0000-0000-000000000001';

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty,
     status, rejection_notes, created_by)
  VALUES (v_item_id, '2026-08-07', 2, '2026-08-07T07:00:00Z', '2026-08-07T15:00:00Z',
          99, 'rejected', 'Cantidades incorrectas', 'aaaaaaaa-0000-0000-0000-000000000003');
END;
$$;

SELECT is(
  (SELECT executed_qty FROM public.weekly_plan_items WHERE plan_id IN (
     SELECT id FROM public.weekly_plans WHERE week_start = '2026-08-04'
     AND group_id = 'cccccccc-0000-0000-0000-000000000001'
   )),
  100::NUMERIC,
  'Test 5b: rejected no modifica el total ✓'
);

ROLLBACK TO sp5;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: confirm_weekly_plan — falla si hay ejecuciones 'reported'
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp6;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_003', 'Actividad Test 3',
     'ZONA DURA', 'und', 5, 4, 'must_execute', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-11', 2, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_003', v_std_id, 5, 4, 'must_execute', 100, 'und', 4)
  RETURNING id INTO v_item_id;

  -- Ejecución en estado 'reported' (pendiente del supervisor)
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at,
     executed_qty, status, created_by)
  VALUES (v_item_id, '2026-08-11', 2, '2026-08-11T07:00:00Z', '2026-08-11T15:00:00Z',
          80, 'reported', 'aaaaaaaa-0000-0000-0000-000000000003');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');  -- assistant
  BEGIN
    PERFORM public.confirm_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 6: debió fallar con ejecuciones pendientes'; END IF;
END;
$$;

SELECT pass('Test 6: confirm falla si hay ejecuciones reported pendientes ✓');

ROLLBACK TO sp6;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7: confirm_weekly_plan — OK cuando todas las ejecuciones están verified
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp7;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_004', 'Actividad Test 4',
     'ZONA VERDE', 'und', 8, 4, 'preferred', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-18', 3, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_004', v_std_id, 8, 4, 'preferred', 80, 'und', 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at,
     executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-08-18', 1, '2026-08-18T07:00:00Z', '2026-08-18T15:00:00Z',
          80, 'verified', 'aaaaaaaa-0000-0000-0000-000000000004', NOW(),
          'aaaaaaaa-0000-0000-0000-000000000003');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');  -- assistant
  PERFORM public.confirm_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE week_start = '2026-08-18'
   AND group_id = 'cccccccc-0000-0000-0000-000000000001'),
  'confirmed',
  'Test 7: in_progress → confirmed cuando todas las ejecuciones están verified ✓'
);

ROLLBACK TO sp7;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8: verify_execution — solo supervisor/admin, solo desde 'reported'
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp8;

DO $$
DECLARE
  v_exec_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
  v_plan_id UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_005', 'Actividad Test 5',
     'ZONA DE PLAYA', 'und', 6, 4, 'flexible', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-25', 4, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_005', v_std_id, 6, 4, 'flexible', 60, 'und', 1.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at,
     executed_qty, status, created_by)
  VALUES (v_item_id, '2026-08-25', 1, '2026-08-25T07:00:00Z', '2026-08-25T15:00:00Z',
          60, 'reported', 'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec_id;

  -- Leader intenta verificar — debe fallar
  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000003');  -- leader
  BEGIN
    PERFORM public.verify_execution(v_exec_id);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 8a: leader no debería poder verificar'; END IF;
END;
$$;

SELECT pass('Test 8a: verify por leader lanza excepción ✓');

DO $$
DECLARE
  v_exec_id UUID;
BEGIN
  SELECT e.id INTO v_exec_id
  FROM public.weekly_plan_item_executions e
  JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
  JOIN public.weekly_plans p ON p.id = i.plan_id
  WHERE p.week_start = '2026-08-25'
    AND p.group_id = 'cccccccc-0000-0000-0000-000000000001';

  -- Supervisor puede verificar
  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000004');  -- supervisor
  PERFORM public.verify_execution(v_exec_id);
END;
$$;

SELECT is(
  (SELECT e.status
   FROM public.weekly_plan_item_executions e
   JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
   JOIN public.weekly_plans p ON p.id = i.plan_id
   WHERE p.week_start = '2026-08-25'
     AND p.group_id = 'cccccccc-0000-0000-0000-000000000001'),
  'verified',
  'Test 8b: reported → verified por supervisor ✓'
);

ROLLBACK TO sp8;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 9: reject_execution — notas obligatorias
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp9;

DO $$
DECLARE
  v_exec_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
  v_plan_id UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_006', 'Actividad Test 6',
     'ZONA VERDE', 'und', 12, 4, 'must_execute', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-01', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_006', v_std_id, 12, 4, 'must_execute', 120, 'und', 3)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at,
     executed_qty, status, created_by)
  VALUES (v_item_id, '2026-09-01', 1, '2026-09-01T07:00:00Z', '2026-09-01T15:00:00Z',
          120, 'reported', 'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000004');  -- supervisor
  BEGIN
    PERFORM public.reject_execution(v_exec_id, '');  -- notas vacías → falla
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 9a: reject con notas vacías debería fallar'; END IF;
END;
$$;

SELECT pass('Test 9a: reject con notas vacías lanza excepción ✓');

DO $$
DECLARE
  v_exec_id UUID;
BEGIN
  SELECT e.id INTO v_exec_id
  FROM public.weekly_plan_item_executions e
  JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
  JOIN public.weekly_plans p ON p.id = i.plan_id
  WHERE p.week_start = '2026-09-01'
    AND p.group_id = 'cccccccc-0000-0000-0000-000000000001';

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000004');
  PERFORM public.reject_execution(v_exec_id, 'Cantidades no coinciden con el parte de campo');
END;
$$;

SELECT is(
  (SELECT e.status
   FROM public.weekly_plan_item_executions e
   JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
   JOIN public.weekly_plans p ON p.id = i.plan_id
   WHERE p.week_start = '2026-09-01'
     AND p.group_id = 'cccccccc-0000-0000-0000-000000000001'),
  'rejected',
  'Test 9b: reported → rejected por supervisor con notas ✓'
);

ROLLBACK TO sp9;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 10: close_weekly_plan — falla si no está confirmed
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp10;

DO $$
DECLARE v_plan_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-08', 2, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000001');  -- admin
  BEGIN
    PERFORM public.close_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 10: close desde in_progress debería fallar'; END IF;
END;
$$;

SELECT pass('Test 10: close desde in_progress lanza excepción ✓');

ROLLBACK TO sp10;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 11: close_weekly_plan — idempotencia (segunda llamada falla)
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp11;

DO $$
DECLARE v_plan_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-15', 3, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000001');  -- admin
  PERFORM public.close_weekly_plan(v_plan_id);

  BEGIN
    PERFORM public.close_weekly_plan(v_plan_id);  -- segunda llamada
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 11: segunda llamada a close debería fallar'; END IF;
END;
$$;

SELECT pass('Test 11: close dos veces lanza excepción en la segunda ✓');

ROLLBACK TO sp11;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 12: replace_weekly_plan_items — transaccional (DELETE + INSERT atómicos)
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp12;

DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
  v_items   JSONB;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_007', 'Actividad Test 7',
     'ZONA VERDE', 'und', 10, 4, 'must_execute', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-22', 4, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  -- Primera carga: 2 items
  v_items := jsonb_build_array(
    jsonb_build_object(
      'planned_sequence', 1, 'activity_key', 'TEST_ACT_007',
      'activity_standard_id', v_std_id, 'planned_rendimiento', 10,
      'planned_frecuencia', 4, 'priority', 'must_execute',
      'planned_qty', 100, 'unit', 'und', 'planned_jr', 2.5
    ),
    jsonb_build_object(
      'planned_sequence', 2, 'activity_key', 'TEST_ACT_007',
      'activity_standard_id', v_std_id, 'planned_rendimiento', 10,
      'planned_frecuencia', 4, 'priority', 'preferred',
      'planned_qty', 50, 'unit', 'und', 'planned_jr', 1.25
    )
  );

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');  -- assistant
  PERFORM public.replace_weekly_plan_items(v_plan_id, v_items);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plan_items
   WHERE plan_id = (SELECT id FROM public.weekly_plans WHERE week_start = '2026-09-22'
                    AND group_id = 'cccccccc-0000-0000-0000-000000000001')),
  2,
  'Test 12a: replace_weekly_plan_items inserta 2 items ✓'
);

-- Segunda llamada reemplaza (no acumula)
DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
  v_items   JSONB;
BEGIN
  SELECT id INTO v_plan_id FROM public.weekly_plans
  WHERE week_start = '2026-09-22' AND group_id = 'cccccccc-0000-0000-0000-000000000001';

  SELECT id INTO v_std_id FROM public.board_activity_standards
  WHERE activity_key = 'TEST_ACT_007' AND board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
  LIMIT 1;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'planned_sequence', 1, 'activity_key', 'TEST_ACT_007',
      'activity_standard_id', v_std_id, 'planned_rendimiento', 10,
      'planned_frecuencia', 4, 'priority', 'must_execute',
      'planned_qty', 200, 'unit', 'und', 'planned_jr', 5
    )
  );

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  PERFORM public.replace_weekly_plan_items(v_plan_id, v_items);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plan_items
   WHERE plan_id = (SELECT id FROM public.weekly_plans WHERE week_start = '2026-09-22'
                    AND group_id = 'cccccccc-0000-0000-0000-000000000001')),
  1,
  'Test 12b: segunda llamada reemplaza (no acumula) — 1 item ✓'
);

SELECT is(
  (SELECT planned_qty FROM public.weekly_plan_items
   WHERE plan_id = (SELECT id FROM public.weekly_plans WHERE week_start = '2026-09-22'
                    AND group_id = 'cccccccc-0000-0000-0000-000000000001')),
  200::NUMERIC,
  'Test 12c: planned_qty del item reemplazado es 200 ✓'
);

ROLLBACK TO sp12;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 13: replace_weekly_plan_items — falla si plan no está en draft
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp13;

DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_std_id FROM public.board_activity_standards
  WHERE activity_key = 'TEST_ACT_001' AND board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
  LIMIT 1;

  IF v_std_id IS NULL THEN
    INSERT INTO public.board_activity_standards
      (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
    VALUES
      ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_008', 'Actividad Test 8',
       'ZONA DURA', 'und', 7, 4, 'preferred', 1, '2026-01-01', 'test')
    RETURNING id INTO v_std_id;
  END IF;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-29', 4, 'published', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(v_plan_id, '[]'::JSONB);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 13: replace en plan published debería fallar'; END IF;
END;
$$;

SELECT pass('Test 13: replace_weekly_plan_items en plan published lanza excepción ✓');

ROLLBACK TO sp13;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 14: report_execution — solo el creador o admin/assistant
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp14;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_exec_id UUID;
  v_std_id  UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_009', 'Actividad Test 9',
     'ZONA VERDE', 'und', 9, 4, 'flexible', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-10-06', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_009', v_std_id, 9, 4, 'flexible', 90, 'und', 2.5)
  RETURNING id INTO v_item_id;

  -- Ejecución creada por el supervisor (no por el leader)
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at,
     executed_qty, status, created_by)
  VALUES (v_item_id, '2026-10-06', 1, '2026-10-06T07:00:00Z', '2026-10-06T15:00:00Z',
          90, 'draft', 'aaaaaaaa-0000-0000-0000-000000000004')  -- supervisor crea
  RETURNING id INTO v_exec_id;

  -- El leader (que no la creó) intenta reportarla — debe fallar
  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000003');  -- leader
  BEGIN
    PERFORM public.report_execution(v_exec_id);
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 14: leader no puede reportar ejecución ajena'; END IF;
END;
$$;

SELECT pass('Test 14: leader no puede reportar ejecución que no creó ✓');

ROLLBACK TO sp14;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 15: close_weekly_plan — genera activity_performance_observations
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp15;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_010', 'Actividad Test 10',
     'ZONA VERDE', 'und', 10, 4, 'must_execute', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-10-13', 2, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr, executed_qty, executed_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_010', v_std_id, 10, 4, 'must_execute', 100, 'und', 2.5, 80, 2.0)
  RETURNING id INTO v_item_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000001');  -- admin
  PERFORM public.close_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.activity_performance_observations
   WHERE board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     AND group_id = 'cccccccc-0000-0000-0000-000000000001'
     AND activity_key = 'TEST_ACT_010'
     AND source = 'weekly_plan_close'),
  1,
  'Test 15a: close_weekly_plan genera una observación de rendimiento ✓'
);

SELECT is(
  (SELECT observed_rendimiento FROM public.activity_performance_observations
   WHERE board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     AND activity_key = 'TEST_ACT_010'
     AND source = 'weekly_plan_close'),
  40::NUMERIC,   -- 80 / 2.0 = 40 und/JR
  'Test 15b: observed_rendimiento = executed_qty / executed_jr ✓'
);

ROLLBACK TO sp15;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 16: close_weekly_plan — no genera observación para items con executed_jr = 0
-- Un item sin jornales ejecutadas no puede calcular rendimiento → se omite.
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp16;

DO $$
DECLARE
  v_plan_id UUID;
  v_item_id UUID;
  v_std_id  UUID;
BEGIN
  INSERT INTO public.board_activity_standards
    (board_id, group_id, activity_key, name, category, unit, rendimiento, frecuencia, priority, version, effective_from, source)
  VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001', NULL, 'TEST_ACT_011', 'Actividad Test 11',
     'ZONA DURA', 'und', 10, 4, 'must_execute', 1, '2026-01-01', 'test')
  RETURNING id INTO v_std_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-10-20', 3, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  -- Item con executed_jr = 0 (sin jornales reportadas)
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, activity_standard_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr, executed_qty, executed_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_011', v_std_id, 10, 4, 'must_execute', 100, 'und', 2.5, 0, 0)
  RETURNING id INTO v_item_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000001');  -- admin
  PERFORM public.close_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.activity_performance_observations
   WHERE board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     AND activity_key = 'TEST_ACT_011'
     AND source = 'weekly_plan_close'),
  0,
  'Test 16: close_weekly_plan omite items con executed_jr = 0 ✓'
);

ROLLBACK TO sp16;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 17: can_verify_execution — viewer no puede verificar
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  public.can_verify_execution(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000005'  -- viewer
  ),
  FALSE,
  'Test 17: can_verify_execution retorna false para viewer ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 18: can_report_execution — leader sí puede reportar
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  public.can_report_execution(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000003'  -- leader
  ),
  TRUE,
  'Test 18: can_report_execution retorna true para leader ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cierre
-- ─────────────────────────────────────────────────────────────────────────────

SELECT * FROM finish();

ROLLBACK;
