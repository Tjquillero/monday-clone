-- =============================================================================
-- Tests: Máquina de estados de weekly_plans + triggers
--
-- CONTRATO DEL DOMINIO: docs/domain/workflow.md
-- Este archivo es su especificación ejecutable. Si un cambio en la máquina de
-- estados hace fallar estos tests o contradice ese documento, ambos deben
-- actualizarse en el mismo cambio — nunca uno solo.
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

-- =============================================================================
-- Verificación pre-transacción: PUBLIC ya tiene EXECUTE en funciones pgTAP
--
-- El ACL de public.ok() es {=X/supabase_admin,...} donde '=' = PUBLIC, 'X' =
-- EXECUTE.  Por eso SET LOCAL ROLE authenticated puede llamar pgTAP sin GRANT
-- adicional.  Si esta comprobación falla, la extensión fue reinstalada con
-- permisos distintos y los tests de RLS con authenticated fallarán.
-- =============================================================================
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.ok(boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'authenticated no tiene EXECUTE en public.ok — '
      'verificar que ALTER EXTENSION pgtap SET SCHEMA public fue aplicado '
      'y que el ACL de la función sigue incluyendo PUBLIC (=X).';
  END IF;
END;
$$;

BEGIN;

SELECT plan(45);

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

-- Helper: siembra la cadena POA (poa → poa_versions activa → poa_activities →
-- poa_activity_zones) para un board/zona/actividad y devuelve el
-- poa_activity_zone_id que weekly_plan_items.poa_activity_zone_id referencia
-- (ADR-0002). Reutilizable e idempotente (ON CONFLICT) para llamadas
-- repetidas sobre el mismo board dentro de un mismo test.
CREATE OR REPLACE FUNCTION _test_seed_poa_activity_zone(
  p_board_id UUID,
  p_zone_id  UUID,
  p_activity_key TEXT,
  p_frecuencia NUMERIC,
  p_precio_unitario NUMERIC DEFAULT 100000,
  p_cantidad_contratada NUMERIC DEFAULT 100000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id      UUID;
  v_version_id  UUID;
  v_activity_id UUID;
  v_zone_row_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name)
  VALUES (p_board_id, 'POA Test')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions
  WHERE poa_id = v_poa_id AND status = 'active';

  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, p_frecuencia, p_precio_unitario)
  ON CONFLICT (poa_version_id, activity_key) DO UPDATE SET frecuencia = EXCLUDED.frecuencia
  RETURNING id INTO v_activity_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_zone_id, p_cantidad_contratada)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada
  RETURNING id INTO v_zone_row_id;

  RETURN v_zone_row_id;
END;
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
  -- Cobertura mínima del POA (poa_activity_zone_id) para esta actividad
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_001', 4);

  -- Plan en published
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-07-28', 1, 'published', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  -- Item del plan
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_002', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-04', 2, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_003', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-11', 2, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_exec_id UUID;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_004', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-18', 3, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'TEST_ACT_004', v_std_id, 8, 4, 'preferred', 80, 'und', 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at,
     executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-08-18', 1, '2026-08-18T07:00:00Z', '2026-08-18T15:00:00Z',
          80, 'verified', 'aaaaaaaa-0000-0000-0000-000000000004', NOW(),
          'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec_id;

  -- Gate de evidencia (20260717_confirm_plan_evidence_gate.sql): toda
  -- ejecución verified necesita al menos una fila en execution_attachments.
  INSERT INTO public.execution_attachments (execution_id, file_name, file_url)
  VALUES (v_exec_id, 'evidencia.jpg', 'https://example.com/evidencia.jpg');

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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_005', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-08-25', 4, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_006', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-01', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_007', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-09-22', 4, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  -- Primera carga: 2 items
  v_items := jsonb_build_array(
    jsonb_build_object(
      'planned_sequence', 1, 'activity_key', 'TEST_ACT_007',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
      'planned_frecuencia', 4, 'priority', 'must_execute',
      'planned_qty', 100, 'unit', 'und', 'planned_jr', 2.5
    ),
    jsonb_build_object(
      'planned_sequence', 2, 'activity_key', 'TEST_ACT_007',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
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

  -- Idempotente: devuelve el mismo poa_activity_zone_id sembrado en el bloque anterior
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_007', 4);

  v_items := jsonb_build_array(
    jsonb_build_object(
      'planned_sequence', 1, 'activity_key', 'TEST_ACT_007',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_008', 4);

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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_009', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-10-06', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_010', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-10-13', 2, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_011', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-10-20', 3, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  -- Item con executed_jr = 0 (sin jornales reportadas)
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
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

-- =============================================================================
-- Tests 19–22: validaciones de replace_weekly_plan_items (business rules)
--
-- Nota sobre cobertura de RLS vs autorización de RPC:
--   Los tests 1–18 prueban la lógica de autorización DENTRO de las funciones
--   SECURITY DEFINER (vía can_*() + board_members).  Esas funciones siempre
--   corren como postgres, así que el rol de llamada no afecta su ejecución.
--   Los tests 19–22 usan postgres directamente para fixtures y llaman los RPCs
--   con distintos JWTs para verificar los cheques internos.
--
--   Los policies de RLS sobre las tablas son una defensa secundaria para acceso
--   directo (REST API sin RPC).  Se basan en las mismas can_*() functions, por
--   lo que la consistencia entre RPC y RLS está garantizada por diseño.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 19: replace_weekly_plan_items con array vacío → 0 items
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp19;

DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_019', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-11-03', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  -- Primero: inserta 2 items para comprobar que el array vacío los elimina
  PERFORM public.replace_weekly_plan_items(
    v_plan_id,
    jsonb_build_array(
      jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_019',
        'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
        'planned_frecuencia', 4, 'priority', 'must_execute', 'planned_qty', 50, 'unit', 'und', 'planned_jr', 1.5)
    )
  );

  -- Segundo: array vacío → borra todos los items
  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  PERFORM public.replace_weekly_plan_items(v_plan_id, '[]'::JSONB);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plan_items
   WHERE plan_id = (SELECT id FROM public.weekly_plans WHERE week_start = '2026-11-03'
                    AND group_id = 'cccccccc-0000-0000-0000-000000000001')),
  0,
  'Test 19: replace con array vacío elimina todos los items ✓'
);

ROLLBACK TO sp19;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 20: poa_activity_zone_id inexistente → excepción
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp20;

DO $$
DECLARE
  v_plan_id UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-11-10', 2, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1, 'activity_key', 'GHOST',
          'poa_activity_zone_id', 'ffffffff-ffff-ffff-ffff-ffffffffffff',  -- no existe
          'planned_rendimiento', 10, 'planned_frecuencia', 4,
          'priority', 'preferred', 'planned_qty', 50, 'unit', 'und', 'planned_jr', 1.5
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 20: debió fallar con UUID inexistente'; END IF;
END;
$$;

SELECT pass('Test 20: poa_activity_zone_id inexistente lanza excepción ✓');

ROLLBACK TO sp20;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 21: planned_sequence duplicado → excepción
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp21;

DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_021', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-11-17', 3, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_021',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 8,
          'planned_frecuencia', 4, 'priority', 'preferred', 'planned_qty', 80, 'unit', 'und', 'planned_jr', 2.0),
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_021',  -- duplicate!
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 8,
          'planned_frecuencia', 4, 'priority', 'preferred', 'planned_qty', 40, 'unit', 'und', 'planned_jr', 1.0)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 21: debió fallar con planned_sequence duplicado'; END IF;
END;
$$;

SELECT pass('Test 21: planned_sequence duplicado lanza excepción ✓');

ROLLBACK TO sp21;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 22: publish_weekly_plan dos veces seguidas → segunda falla
-- ─────────────────────────────────────────────────────────────────────────────

SAVEPOINT sp22;

DO $$
DECLARE v_plan_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-11-24', 4, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');  -- assistant
  PERFORM public.publish_weekly_plan(v_plan_id);  -- primera llamada: OK

  BEGIN
    PERFORM public.publish_weekly_plan(v_plan_id);  -- segunda llamada: falla
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN RAISE EXCEPTION 'Test 22: segunda publish debería fallar'; END IF;
END;
$$;

SELECT pass('Test 22: publish_weekly_plan dos veces lanza excepción en la segunda ✓');

ROLLBACK TO sp22;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tests 23–28: planned_qty/jr inválidos + poa_activity_zone_id de otro board
-- ─────────────────────────────────────────────────────────────────────────────

-- Test 23: planned_qty = 0 → rechazado
SAVEPOINT sp23;
DO $$
DECLARE v_plan_id UUID; v_std_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_023', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-12-01', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_023',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 5,
          'planned_frecuencia', 4, 'priority', 'flexible',
          'planned_qty', 0, 'unit', 'und', 'planned_jr', 1.0)  -- qty = 0 → invalid
      )
    );
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Test 23: planned_qty = 0 debería fallar'; END IF;
END;
$$;
SELECT pass('Test 23: planned_qty = 0 lanza excepción ✓');
ROLLBACK TO sp23;

-- Test 24: planned_jr negativo → rechazado
SAVEPOINT sp24;
DO $$
DECLARE v_plan_id UUID; v_std_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_024', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-12-08', 2, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_024',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 5,
          'planned_frecuencia', 4, 'priority', 'flexible',
          'planned_qty', 50, 'unit', 'und', 'planned_jr', -1.0)  -- jr negativo → invalid
      )
    );
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Test 24: planned_jr negativo debería fallar'; END IF;
END;
$$;
SELECT pass('Test 24: planned_jr negativo lanza excepción ✓');
ROLLBACK TO sp24;

-- Test 25: priority inválida → rechazado
SAVEPOINT sp25;
DO $$
DECLARE v_plan_id UUID; v_std_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_025', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-12-15', 3, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_025',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 7,
          'planned_frecuencia', 4, 'priority', 'urgent',  -- valor inválido
          'planned_qty', 70, 'unit', 'und', 'planned_jr', 2.0)
      )
    );
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Test 25: priority inválida debería fallar'; END IF;
END;
$$;
SELECT pass('Test 25: priority inválida lanza excepción ✓');
ROLLBACK TO sp25;

-- Test 26: poa_activity_zone_id de otro board → rechazado
SAVEPOINT sp26;
DO $$
DECLARE
  v_plan_id   UUID;
  v_other_std UUID;
  v_other_brd UUID;
  v_other_usr UUID;
  v_ok        BOOLEAN := FALSE;
BEGIN
  -- Crear otro board con su propio estándar
  SELECT id INTO v_other_usr FROM auth.users WHERE email = 'admin_test@mantenix.test' LIMIT 1;
  IF v_other_usr IS NULL THEN v_other_usr := 'aaaaaaaa-0000-0000-0000-000000000001'::UUID; END IF;

  INSERT INTO public.boards (name, owner_id, created_at)
  VALUES ('Other Board Test', v_other_usr, NOW())
  RETURNING id INTO v_other_brd;

  v_other_std := _test_seed_poa_activity_zone(v_other_brd, 'cccccccc-0000-0000-0000-000000000001', 'OTHER_ACT_001', 4);

  -- Plan en nuestro board de prueba
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-12-22', 4, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'OTHER_ACT_001',
          'poa_activity_zone_id', v_other_std,  -- estándar del OTRO board
          'planned_rendimiento', 5, 'planned_frecuencia', 4, 'priority', 'flexible',
          'planned_qty', 50, 'unit', 'und', 'planned_jr', 1.5)
      )
    );
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Test 26: estándar de otro board debería fallar'; END IF;
END;
$$;
SELECT pass('Test 26: poa_activity_zone_id de otro board lanza excepción ✓');
ROLLBACK TO sp26;

-- Test 27: replace devuelve filas ordenadas por planned_sequence
SAVEPOINT sp27;
DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
  v_result  INT[];
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_027', 4);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2026-12-29', 4, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  -- Envía items fuera de orden (3, 1, 2) — deben devolverse ordenados
  SELECT ARRAY(
    SELECT (r).planned_sequence
    FROM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 3, 'activity_key', 'TEST_ACT_027',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
          'planned_frecuencia', 4, 'priority', 'preferred', 'planned_qty', 30, 'unit', 'und', 'planned_jr', 1.0),
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_027',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
          'planned_frecuencia', 4, 'priority', 'must_execute', 'planned_qty', 10, 'unit', 'und', 'planned_jr', 0.5),
        jsonb_build_object('planned_sequence', 2, 'activity_key', 'TEST_ACT_027',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
          'planned_frecuencia', 4, 'priority', 'flexible', 'planned_qty', 20, 'unit', 'und', 'planned_jr', 0.75)
      )
    ) r
  ) INTO v_result;

  IF v_result != ARRAY[1,2,3] THEN
    RAISE EXCEPTION 'Test 27: orden incorrecto: %', v_result;
  END IF;
END;
$$;
SELECT pass('Test 27: replace_weekly_plan_items devuelve filas ordenadas por planned_sequence ✓');
ROLLBACK TO sp27;

-- Test 28: poa_activity_zone_id archivado (effective_to IS NOT NULL) → rechazado
SAVEPOINT sp28;
DO $$
DECLARE
  v_plan_id UUID;
  v_std_id  UUID;
  v_ok      BOOLEAN := FALSE;
BEGIN
  -- Versión del POA NO activa (closed) — equivalente a un estándar archivado.
  -- El RPC exige pv.status = 'active', así que su poa_activity_zone_id debe rechazarse.
  DECLARE
    v_poa_id      UUID;
    v_version_id  UUID;
    v_activity_id UUID;
  BEGIN
    INSERT INTO public.poa (board_id, name)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'POA Test')
    ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_poa_id;

    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by, closed_at)
    VALUES (v_poa_id, 99, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
    RETURNING id INTO v_version_id;

    INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
    VALUES (v_version_id, 'TEST_ACT_028', 4, 100000)
    RETURNING id INTO v_activity_id;

    INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
    VALUES (v_activity_id, 'cccccccc-0000-0000-0000-000000000001', 100000)
    RETURNING id INTO v_std_id;
  END;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
          '2027-01-05', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object('planned_sequence', 1, 'activity_key', 'TEST_ACT_028',
          'poa_activity_zone_id', v_std_id,  -- archivado: effective_to IS NOT NULL
          'planned_rendimiento', 9, 'planned_frecuencia', 4, 'priority', 'preferred',
          'planned_qty', 90, 'unit', 'und', 'planned_jr', 2.5)
      )
    );
  EXCEPTION WHEN OTHERS THEN v_ok := TRUE;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'Test 28: estándar archivado debería fallar'; END IF;
END;
$$;
SELECT pass('Test 28: poa_activity_zone_id archivado lanza excepción ✓');
ROLLBACK TO sp28;

-- =============================================================================
-- Tests 29–33: Contratos de autorización (solo lectura — sin SAVEPOINT)
--
-- RPC SECURITY DEFINER y policies RLS comparten get_user_board_role() y
-- can_*(). Probar la función es probar el contrato que ambas capas ejecutan.
-- Sin SAVEPOINT: ROLLBACK TO revertería el contador interno de pgTAP causando
-- el diagnóstico falso "planned N but ran M".
-- =============================================================================

-- Test 29: get_user_board_role — viewer en el board de prueba retorna 'viewer'
SELECT is(
  public.get_user_board_role(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000005'
  ),
  'viewer',
  'Test 29: get_user_board_role retorna viewer ✓'
);

-- Test 30: get_user_board_role — board inexistente retorna NULL (cubre USING policy)
SELECT is(
  public.get_user_board_role(
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'aaaaaaaa-0000-0000-0000-000000000005'
  ),
  NULL::TEXT,
  'Test 30: get_user_board_role retorna NULL para board inexistente ✓'
);

-- Test 31: get_user_board_role — supervisor en el board de prueba retorna 'supervisor'
SELECT is(
  public.get_user_board_role(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000004'
  ),
  'supervisor',
  'Test 31: get_user_board_role retorna supervisor ✓'
);

-- Test 32: can_manage_weekly_plan — admin retorna TRUE
SELECT is(
  public.can_manage_weekly_plan(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001'
  ),
  TRUE,
  'Test 32: can_manage_weekly_plan retorna true para admin ✓'
);

-- Test 33: can_manage_weekly_plan — leader retorna FALSE
SELECT is(
  public.can_manage_weekly_plan(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000003'
  ),
  FALSE,
  'Test 33: can_manage_weekly_plan retorna false para leader ✓'
);

-- =============================================================================
-- Tests 34–36: RLS real — SET LOCAL ROLE authenticated
--
-- Estos tests ejercen las USING policies de la tabla weekly_plans directamente,
-- sin pasar por ninguna función SECURITY DEFINER.  El GRANT al inicio del
-- archivo (transaccional) permite que pgTAP funcione bajo authenticated.
--
-- NO usan SAVEPOINT porque el ROLLBACK TO revertería el SET LOCAL ROLE.
-- Los datos se crean aquí (fuera de todo SAVEPOINT) y se limpian con el
-- ROLLBACK final del archivo.
-- =============================================================================

-- Fixtures para los tests RLS (sin SAVEPOINT — limpios con ROLLBACK final)
DO $$
BEGIN
  -- Board B: el viewer NO es miembro → para verificar aislamiento RLS
  INSERT INTO public.boards (id, name, owner_id)
  VALUES ('dddddddd-0000-0000-0000-000000000099', 'Board RLS Test',
          'aaaaaaaa-0000-0000-0000-000000000001');

  INSERT INTO public.board_members (board_id, user_id, role)
  VALUES ('dddddddd-0000-0000-0000-000000000099',
          'aaaaaaaa-0000-0000-0000-000000000001', 'admin');

  INSERT INTO public.groups (id, board_id, title, color, position)
  VALUES ('66666666-0000-0000-0000-000000000099',
          'dddddddd-0000-0000-0000-000000000099', 'Grupo RLS', '#003366', 0);

  -- Plan en Board B (viewer no es miembro → no debería verlo)
  INSERT INTO public.weekly_plans
    (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('dddddddd-0000-0000-0000-000000000099',
          '66666666-0000-0000-0000-000000000099',
          '2027-02-09', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000001');

  -- Plan en Board A (bbbbbbbb) — viewer SÍ es miembro → debe verlo
  INSERT INTO public.weekly_plans
    (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001',
          '2027-02-16', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002');
END;
$$;

-- Cambiar JWT al viewer (sin SAVEPOINT: persiste hasta ROLLBACK final)
SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000005');

-- Activar RLS: authenticated no tiene BYPASSRLS
SET LOCAL ROLE authenticated;

-- Test 34: RLS USING — viewer ve el plan de su propio board
SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plans
   WHERE board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     AND week_start = '2027-02-16'),
  1,
  'Test 34: RLS USING — viewer ve plan de board al que pertenece ✓'
);

-- Test 35: RLS USING — viewer NO ve planes de board ajeno
SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plans
   WHERE board_id = 'dddddddd-0000-0000-0000-000000000099'),
  0,
  'Test 35: RLS USING — viewer no ve planes de board al que no pertenece ✓'
);

-- Cambiar JWT al admin (miembro de board B → debe ver su plan)
SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000001');

-- Test 36: RLS USING — admin ve plan de board donde tiene membresía
SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plans
   WHERE board_id = 'dddddddd-0000-0000-0000-000000000099'),
  1,
  'Test 36: RLS USING — admin ve plan de board donde es miembro ✓'
);

-- Volver a postgres para los tests de atomicidad e idempotencia
SET LOCAL ROLE postgres;

-- =============================================================================
-- Test 37: Atomicidad — fallo de validación preserva el estado anterior
--
-- Contrato: si la lista contiene un item inválido, la validación falla ANTES
-- del DELETE, por lo que los items previos quedan intactos.
-- =============================================================================

-- Sin SAVEPOINT: el ROLLBACK final limpia los datos.
-- Usar SAVEPOINT aquí revierte el contador interno de pgTAP causando "bad plan".

DO $$
DECLARE v_plan_id UUID; v_std_id UUID; v_ok BOOLEAN := FALSE;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_037', 4);

  INSERT INTO public.weekly_plans
    (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001',
          '2027-02-23', 2, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');

  -- Primera llamada: inserta 1 item válido
  PERFORM public.replace_weekly_plan_items(
    v_plan_id,
    jsonb_build_array(
      jsonb_build_object(
        'planned_sequence', 1, 'activity_key', 'TEST_ACT_037',
        'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
        'planned_frecuencia', 4, 'priority', 'preferred',
        'planned_qty', 100, 'unit', 'und', 'planned_jr', 2.0)
    )
  );

  -- Segunda llamada: [válido, inválido] → falla en validación (antes del DELETE)
  BEGIN
    PERFORM public.replace_weekly_plan_items(
      v_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1, 'activity_key', 'TEST_ACT_037',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
          'planned_frecuencia', 4, 'priority', 'preferred',
          'planned_qty', 50, 'unit', 'und', 'planned_jr', 1.0),
        jsonb_build_object(
          'planned_sequence', 2, 'activity_key', 'TEST_ACT_037',
          'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 10,
          'planned_frecuencia', 4, 'priority', 'urgent',   -- prioridad inválida
          'planned_qty', 50, 'unit', 'und', 'planned_jr', 1.0)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_ok := TRUE;
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 37: la segunda replace debería haber fallado';
  END IF;
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plan_items
   WHERE plan_id = (
     SELECT id FROM public.weekly_plans
     WHERE board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
       AND week_start = '2027-02-23'
   )),
  1,
  'Test 37: replace atómico — validación previa al DELETE preserva estado anterior ✓'
);

-- =============================================================================
-- Test 38: Idempotencia — doble replace con mismo payload: igual count E igual contenido
--
-- Dos llamadas idénticas deben producir el mismo conjunto de filas:
-- mismo count, mismos valores, mismo orden.  El hash md5 captura todo eso.
-- Sin SAVEPOINT por la misma razón que test 37.
-- =============================================================================

DO $$
DECLARE
  v_plan_id     UUID;
  v_std_id      UUID;
  v_items       JSONB;
  v_hash_first  TEXT;
  v_hash_second TEXT;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_038', 4);

  INSERT INTO public.weekly_plans
    (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001',
          '2027-03-02', 1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');

  v_items := jsonb_build_array(
    jsonb_build_object(
      'planned_sequence', 1, 'activity_key', 'TEST_ACT_038',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 8,
      'planned_frecuencia', 4, 'priority', 'must_execute',
      'planned_qty', 80, 'unit', 'und', 'planned_jr', 2.0),
    jsonb_build_object(
      'planned_sequence', 2, 'activity_key', 'TEST_ACT_038',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 8,
      'planned_frecuencia', 4, 'priority', 'preferred',
      'planned_qty', 40, 'unit', 'und', 'planned_jr', 1.0)
  );

  PERFORM public.replace_weekly_plan_items(v_plan_id, v_items);

  -- Hash completo de fila usando to_jsonb para cobertura automática de columnas.
  -- Se excluyen las columnas volátiles que cambian legítimamente en cada
  -- DELETE+INSERT: 'id' (UUID nuevo), 'created_at' (timestamp nuevo).
  -- 'updated_at' también se excluye aunque hoy solo se actualiza en UPDATE.
  --
  -- MANTENIMIENTO: si en el futuro se añaden columnas volátiles similares
  -- (p.ej. last_synced_at, lock_owner, row_version), añadirlas aquí con '- 'col''.
  -- Columnas de negocio nuevas (normalized_priority, notes, etc.) NO deben
  -- excluirse: el test debe detectar que cambian si cambian.
  SELECT md5(jsonb_agg(
    (to_jsonb(wi) - 'id' - 'created_at' - 'updated_at')
    ORDER BY wi.planned_sequence
  )::TEXT)
  INTO v_hash_first
  FROM public.weekly_plan_items wi WHERE wi.plan_id = v_plan_id;

  PERFORM public.replace_weekly_plan_items(v_plan_id, v_items);  -- segunda llamada idéntica

  SELECT md5(jsonb_agg(
    (to_jsonb(wi) - 'id' - 'created_at' - 'updated_at')
    ORDER BY wi.planned_sequence
  )::TEXT)
  INTO v_hash_second
  FROM public.weekly_plan_items wi WHERE wi.plan_id = v_plan_id;

  IF v_hash_first IS DISTINCT FROM v_hash_second THEN
    RAISE EXCEPTION
      'Test 38: idempotencia fallida — contenido cambió tras segunda llamada '
      '(antes=%, después=%)', v_hash_first, v_hash_second;
  END IF;
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.weekly_plan_items
   WHERE plan_id = (
     SELECT id FROM public.weekly_plans
     WHERE board_id = 'bbbbbbbb-0000-0000-0000-000000000001'
       AND week_start = '2027-03-02'
   )),
  2,
  'Test 38: replace idempotente — mismo contenido y mismo count tras doble llamada ✓'
);

-- =============================================================================
-- Test 39: replace_weekly_plan_items devuelve estado definitivo (SELECT, no RETURNING *)
--
-- Verifica que el hash del resultado del RPC == hash de SELECT directo en tabla.
-- Sin SAVEPOINT para no revertir el contador de pgTAP.
--
-- Contexto: en la DB actual no existe AFTER trigger que modifique filas de
-- weekly_plan_items en INSERT.  Este test documenta el contrato y fallará si
-- en el futuro se añade un trigger así y el RPC vuelve a usar RETURNING *.
-- =============================================================================

DO $$
DECLARE
  v_plan_id  UUID;
  v_std_id   UUID;
  v_items    JSONB;
  v_rpc_hash TEXT;
  v_tbl_hash TEXT;
BEGIN
  v_std_id := _test_seed_poa_activity_zone('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'TEST_ACT_039', 4);

  INSERT INTO public.weekly_plans
    (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001',
          '2027-03-09', 2, 'draft', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000002');

  v_items := jsonb_build_array(
    jsonb_build_object(
      'planned_sequence', 1, 'activity_key', 'TEST_ACT_039',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 12,
      'planned_frecuencia', 4, 'priority', 'must_execute',
      'planned_qty', 120, 'unit', 'und', 'planned_jr', 3.0),
    jsonb_build_object(
      'planned_sequence', 2, 'activity_key', 'TEST_ACT_039',
      'poa_activity_zone_id', v_std_id, 'planned_rendimiento', 12,
      'planned_frecuencia', 4, 'priority', 'preferred',
      'planned_qty', 60, 'unit', 'und', 'planned_jr', 1.5)
  );

  -- Serialización completa de fila: cualquier columna nueva (incluyendo las
  -- modificadas por un futuro AFTER trigger) queda incluida automáticamente.
  -- El RPC devuelve SETOF weekly_plan_items, así que 'r' tiene el mismo tipo
  -- que la tabla y to_jsonb(r) produce la misma estructura que to_jsonb(wi).
  SELECT md5(jsonb_agg(to_jsonb(r) ORDER BY r.planned_sequence)::TEXT)
  INTO v_rpc_hash
  FROM public.replace_weekly_plan_items(v_plan_id, v_items) r;

  -- Hash del estado definitivo en tabla (post todos los triggers)
  SELECT md5(jsonb_agg(to_jsonb(wi) ORDER BY wi.planned_sequence)::TEXT)
  INTO v_tbl_hash
  FROM public.weekly_plan_items wi WHERE wi.plan_id = v_plan_id;

  IF v_rpc_hash IS DISTINCT FROM v_tbl_hash THEN
    RAISE EXCEPTION
      'Test 39: RPC devuelve datos distintos al estado final de la tabla '
      '— posible uso de RETURNING * en vez de SELECT post-INSERT. '
      'RPC=%, tabla=%', v_rpc_hash, v_tbl_hash;
  END IF;
END;
$$;

SELECT pass('Test 39: replace devuelve hash idéntico al SELECT definitivo de la tabla ✓');

-- ─────────────────────────────────────────────────────────────────────────────
-- Cierre
-- ─────────────────────────────────────────────────────────────────────────────

SELECT * FROM finish();

ROLLBACK;

-- =============================================================================
-- Verificación post-ROLLBACK: el GRANT de PUBLIC en pgTAP permanece intacto
--
-- El ROLLBACK revirtió todos los cambios del test (datos, roles locales).
-- El privilegio de authenticated sobre pgTAP es pre-existente (vía PUBLIC =X),
-- no lo concedimos nosotros, por lo tanto debe seguir siendo TRUE.
-- Si devuelve FALSE, la extensión perdió permisos en el ROLLBACK — raro pero
-- indicaría un problema con el DDL transaccional de esta instancia de Supabase.
-- =============================================================================
DO $$
DECLARE v_has_exec BOOLEAN;
BEGIN
  SELECT has_function_privilege('authenticated', 'public.ok(boolean, text)', 'EXECUTE')
  INTO v_has_exec;

  IF NOT v_has_exec THEN
    RAISE EXCEPTION
      'Post-ROLLBACK: authenticated perdió EXECUTE en public.ok — '
      'el privilegio PUBLIC fue revertido, lo que no debería ocurrir.';
  END IF;

  RAISE NOTICE 'Verificación de permisos post-ROLLBACK OK (PUBLIC conserva EXECUTE pre-existente)';
END;
$$;
