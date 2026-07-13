-- =============================================================================
-- Tests: get_executions_without_evidence() (IA)
--
-- CONTRATO: supabase/migrations/20260810_ai_executions_without_evidence.sql
-- (misma condición que Gate 2 / MEVID de confirm_weekly_plan, extendida a
-- nivel de board)
--
-- Cubre: verified SIN evidencia aparece; verified CON evidencia no aparece;
-- reported/rejected sin evidencia no aparecen (estado incorrecto, no forman
-- parte del gate); autorización; board vacío.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar (con el ciclo completo, no un archivo suelto):
--   npm run test:db:setup && npm run test:db && npm run test:db:teardown
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(8);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0019 / 5ca1ab1e...1901).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000019', 'Test Board Executions Without Evidence', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000001901', 'ec0e0000-0000-0000-0000-000000000019', 'Zona Evidencia', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000019', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ec0e0000-0000-0000-0000-000000000019', 'EV_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_execution_19(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE, p_status TEXT, p_with_attachment BOOLEAN
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
  v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Evidence')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;
  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, 4, 1000)
  ON CONFLICT (poa_version_id, activity_key) DO NOTHING
  RETURNING id INTO v_activity_id;
  IF v_activity_id IS NULL THEN
    SELECT id INTO v_activity_id FROM public.poa_activities WHERE poa_version_id = v_version_id AND activity_key = p_activity_key;
  END IF;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_group_id, 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO NOTHING
  RETURNING id INTO v_paz_id;
  IF v_paz_id IS NULL THEN
    SELECT id INTO v_paz_id FROM public.poa_activity_zones WHERE poa_activity_id = v_activity_id AND zone_id = p_group_id;
  END IF;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES (p_board_id, p_group_id, p_week_start, 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, p_activity_key, v_paz_id, 10, 4, 'preferred', 10, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status,
     verified_by, verified_at, rejection_notes, created_by)
  VALUES (
    v_item_id, p_week_start, 2, (p_week_start::TEXT || ' 07:00:00')::TIMESTAMPTZ, (p_week_start::TEXT || ' 15:00:00')::TIMESTAMPTZ,
    10, p_status,
    CASE WHEN p_status = 'verified' THEN 'aaaaaaaa-0000-0000-0000-000000000001'::UUID END,
    CASE WHEN p_status = 'verified' THEN NOW() END,
    CASE WHEN p_status = 'rejected' THEN 'Evidencia insuficiente' END,
    'aaaaaaaa-0000-0000-0000-000000000001'
  )
  RETURNING id INTO v_exec_id;

  IF p_with_attachment THEN
    INSERT INTO public.execution_attachments (execution_id, file_name, file_url, file_type, uploaded_by)
    VALUES (v_exec_id, 'foto.jpg', 'https://example.test/foto.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001');
  END IF;

  RETURN v_exec_id;
END;
$$;

DO $$
DECLARE v_exec_verified_no_evidence UUID;
BEGIN
  -- Verified CON evidencia -> no debe aparecer.
  PERFORM _test_seed_execution_19('ec0e0000-0000-0000-0000-000000000019', '5ca1ab1e-0000-0000-0000-000000001901', 'EV_001', '2026-11-02', 'verified', true);
  -- Verified SIN evidencia -> DEBE aparecer.
  v_exec_verified_no_evidence := _test_seed_execution_19('ec0e0000-0000-0000-0000-000000000019', '5ca1ab1e-0000-0000-0000-000000001901', 'EV_001', '2026-11-09', 'verified', false);
  -- Reported sin evidencia -> no debe aparecer (estado incorrecto, no participa del gate).
  PERFORM _test_seed_execution_19('ec0e0000-0000-0000-0000-000000000019', '5ca1ab1e-0000-0000-0000-000000001901', 'EV_001', '2026-11-16', 'reported', false);
  -- Rejected sin evidencia -> no debe aparecer (terminal, no participa del gate).
  PERFORM _test_seed_execution_19('ec0e0000-0000-0000-0000-000000000019', '5ca1ab1e-0000-0000-0000-000000001901', 'EV_001', '2026-11-23', 'rejected', false);

  PERFORM set_config('ev_test.exec_no_evidence', v_exec_verified_no_evidence::TEXT, false);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019')),
  1,
  'Test 1: solo 1 fila entre las 4 ejecuciones — únicamente la verified sin evidencia ✓'
);
SELECT is(
  (SELECT execution_id FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019')),
  current_setting('ev_test.exec_no_evidence')::UUID,
  'Test 2: la fila corresponde a la ejecución correcta ✓'
);
SELECT is(
  (SELECT activity_name FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019')),
  'Poda de árboles',
  'Test 3: activity_name resuelto desde board_activity_standards ✓'
);
SELECT is(
  (SELECT zone_name FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019')),
  'Zona Evidencia',
  'Test 4: zone_name = título del group ✓'
);
SELECT is(
  (SELECT plan_status FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019')),
  'in_progress',
  'Test 5: plan_status refleja el estado real del plan (no confirmado todavía) ✓'
);
SELECT is(
  (SELECT execution_date FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019')),
  '2026-11-09'::DATE,
  'Test 6: execution_date correcto ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000019') $$,
  '%No tiene acceso%',
  'Test 7: un no-miembro no puede leer get_executions_without_evidence() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000020', 'Test Board Executions Without Evidence Empty', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000020', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_executions_without_evidence('ec0e0000-0000-0000-0000-000000000020')),
  0,
  'Test 8: un board sin ejecuciones devuelve 0 filas, sin error ✓'
);

SELECT * FROM finish();
ROLLBACK;
