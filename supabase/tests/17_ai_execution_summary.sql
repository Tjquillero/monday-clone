-- =============================================================================
-- Tests: get_execution_summary() (IA)
--
-- CONTRATO: supabase/migrations/20260807_ai_execution_summary.sql
--
-- Cubre: conteo correcto por status (reported/verified/rejected), total,
-- board vacío, y autorización.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/17_ai_execution_summary.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(7);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000 / 5ca1ab1e). 2 reported, 3 verified, 1 rejected.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000001', 'Test Board Execution Summary', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000701', 'ec0e0000-0000-0000-0000-000000000001', 'Sitio Execution Summary', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ec0e0000-0000-0000-0000-000000000001', 'ES_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_execution_17(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE, p_status TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
  v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Execution Summary')
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

  RETURN v_exec_id;
END;
$$;

DO $$
BEGIN
  PERFORM _test_seed_execution_17('ec0e0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000701', 'ES_001', '2026-11-02', 'reported');
  PERFORM _test_seed_execution_17('ec0e0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000701', 'ES_001', '2026-11-09', 'reported');
  PERFORM _test_seed_execution_17('ec0e0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000701', 'ES_001', '2026-11-16', 'verified');
  PERFORM _test_seed_execution_17('ec0e0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000701', 'ES_001', '2026-11-23', 'verified');
  PERFORM _test_seed_execution_17('ec0e0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000701', 'ES_001', '2026-11-30', 'verified');
  PERFORM _test_seed_execution_17('ec0e0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000701', 'ES_001', '2026-12-07', 'rejected');
END;
$$;

SELECT is(
  (SELECT reported FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000001')),
  2,
  'Test 1: reported = 2 ✓'
);
SELECT is(
  (SELECT verified FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000001')),
  3,
  'Test 2: verified = 3 ✓'
);
SELECT is(
  (SELECT rejected FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000001')),
  1,
  'Test 3: rejected = 1 ✓'
);
SELECT is(
  (SELECT total FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000001')),
  6,
  'Test 4: total = 6 (2+3+1) ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000001') $$,
  '%No tiene acceso%',
  'Test 5: un no-miembro no puede leer get_execution_summary() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000002', 'Test Board Execution Summary Empty', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT total FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000002')),
  0,
  'Test 6: un board sin ejecuciones devuelve total = 0, sin error ✓'
);
SELECT is(
  (SELECT reported FROM public.get_execution_summary('ec0e0000-0000-0000-0000-000000000002')),
  0,
  'Test 7: reported = 0 en un board vacío (no NULL) ✓'
);

SELECT * FROM finish();
ROLLBACK;
