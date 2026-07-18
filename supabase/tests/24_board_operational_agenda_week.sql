-- =============================================================================
-- Tests: get_board_operational_agenda_week(board_id, date)
--
-- CONTRATO: supabase/migrations/20260822_board_operational_agenda_week.sql
-- Resumen de solo lectura para la Agenda Operativa (vista Semana): por sitio
-- con plan activo en la semana vigente (lunes-viernes), % verificado de la
-- semana + semaforo, y que dias tuvieron actividad.
--
-- Fecha de referencia fija: TEST_DATE = 2026-09-16 (miercoles) -> semana
-- vigente = 2026-09-14 (lunes) a 2026-09-18 (viernes).
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

SELECT plan(9);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0025 / 5ca1ab1e...25NN)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000025', 'Test Board Agenda Semana', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000025', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position) VALUES
  ('5ca1ab1e-0000-0000-0000-000000002501', 'ec0e0000-0000-0000-0000-000000000025', 'Sitio Multi Dia', '#3B7EF8', 0),
  ('5ca1ab1e-0000-0000-0000-000000002502', 'ec0e0000-0000-0000-0000-000000000025', 'Sitio Confirmed Semana', '#10B981', 1),
  ('5ca1ab1e-0000-0000-0000-000000002503', 'ec0e0000-0000-0000-0000-000000000025', 'Sitio Semana Pasada', '#444444', 2)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_plan_24(p_group_id UUID, p_week_start DATE, p_status TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_plan_id UUID;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('ec0e0000-0000-0000-0000-000000000025', p_group_id, p_week_start, 1, p_status, 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;
  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION _test_seed_item_execution_24(
  p_plan_id UUID, p_group_id UUID, p_activity_key TEXT, p_execution_date DATE, p_status TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('ec0e0000-0000-0000-0000-000000000025', 'POA Test Agenda Semana')
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

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (p_plan_id, (SELECT COALESCE(MAX(planned_sequence), 0) + 1 FROM public.weekly_plan_items WHERE plan_id = p_plan_id),
          p_activity_key, v_paz_id, 10, 4, 'preferred', 10, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status,
     verified_by, verified_at, rejection_notes, created_by)
  VALUES (
    v_item_id, p_execution_date,
    2, (p_execution_date::TEXT || ' 07:00:00')::TIMESTAMPTZ, (p_execution_date::TEXT || ' 15:00:00')::TIMESTAMPTZ,
    10, p_status,
    CASE WHEN p_status = 'verified' THEN 'aaaaaaaa-0000-0000-0000-000000000001'::UUID END,
    CASE WHEN p_status = 'verified' THEN NOW() END,
    CASE WHEN p_status = 'rejected' THEN 'Motivo de prueba' END,
    'aaaaaaaa-0000-0000-0000-000000000001'
  )
  RETURNING id INTO v_exec_id;

  RETURN v_exec_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Semana vigente: 2026-09-14 (lun) a 2026-09-18 (vie). TEST_DATE = 2026-09-16.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_p1 UUID; v_p2 UUID; v_p3 UUID;
BEGIN
  -- G1: actividad lun/mar/mie/jue (no vie). 3 verified + 1 rejected = 75% -> ambar.
  v_p1 := _test_seed_plan_24('5ca1ab1e-0000-0000-0000-000000002501', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_24(v_p1, '5ca1ab1e-0000-0000-0000-000000002501', 'AGW_ACT_01A', '2026-09-14', 'verified'); -- lun
  PERFORM _test_seed_item_execution_24(v_p1, '5ca1ab1e-0000-0000-0000-000000002501', 'AGW_ACT_01B', '2026-09-15', 'rejected'); -- mar
  PERFORM _test_seed_item_execution_24(v_p1, '5ca1ab1e-0000-0000-0000-000000002501', 'AGW_ACT_01C', '2026-09-16', 'verified'); -- mie
  PERFORM _test_seed_item_execution_24(v_p1, '5ca1ab1e-0000-0000-0000-000000002501', 'AGW_ACT_01D', '2026-09-17', 'verified'); -- jue

  -- G2: confirmed, solo lunes con actividad, 100% -> verde. Sin gate: debe aparecer igual.
  v_p2 := _test_seed_plan_24('5ca1ab1e-0000-0000-0000-000000002502', '2026-09-14', 'confirmed');
  PERFORM _test_seed_item_execution_24(v_p2, '5ca1ab1e-0000-0000-0000-000000002502', 'AGW_ACT_02', '2026-09-14', 'verified');

  -- G3: semana PASADA -> no debe aparecer en site_weeks.
  v_p3 := _test_seed_plan_24('5ca1ab1e-0000-0000-0000-000000002503', '2026-09-07', 'in_progress');
  PERFORM _test_seed_item_execution_24(v_p3, '5ca1ab1e-0000-0000-0000-000000002503', 'AGW_ACT_03', '2026-09-07', 'verified');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rango de semana
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT week_start FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16')),
  '2026-09-14'::DATE,
  'Test 1: week_start = lunes de la semana vigente (2026-09-14) ✓'
);
SELECT is(
  (SELECT week_end FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16')),
  '2026-09-18'::DATE,
  'Test 2: week_end = viernes de la semana vigente (2026-09-18), no domingo ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sitio Multi Dia: dias con/sin actividad y semaforo semanal
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (
    SELECT day_elem->>'has_activity'
    FROM jsonb_array_elements(
      (SELECT site_weeks FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16'))
    ) site_elem
    CROSS JOIN LATERAL jsonb_array_elements(site_elem->'days') day_elem
    WHERE site_elem->>'group_title' = 'Sitio Multi Dia' AND day_elem->>'date' = '2026-09-18'
  ),
  'false',
  'Test 3: Sitio Multi Dia — viernes (2026-09-18) sin actividad ✓'
);
SELECT is(
  (
    SELECT day_elem->>'has_activity'
    FROM jsonb_array_elements(
      (SELECT site_weeks FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16'))
    ) site_elem
    CROSS JOIN LATERAL jsonb_array_elements(site_elem->'days') day_elem
    WHERE site_elem->>'group_title' = 'Sitio Multi Dia' AND day_elem->>'date' = '2026-09-16'
  ),
  'true',
  'Test 4: Sitio Multi Dia — miercoles (2026-09-16) con actividad ✓'
);
SELECT is(
  (SELECT (elem->>'pct_verified_week')::NUMERIC FROM jsonb_array_elements(
     (SELECT site_weeks FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16'))
   ) elem WHERE elem->>'group_title' = 'Sitio Multi Dia'),
  75.0,
  'Test 5: Sitio Multi Dia — 3 verified / 4 total = 75% ✓'
);
SELECT is(
  (SELECT elem->>'semaphore' FROM jsonb_array_elements(
     (SELECT site_weeks FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16'))
   ) elem WHERE elem->>'group_title' = 'Sitio Multi Dia'),
  'amber',
  'Test 6: 75% -> ambar (entre 50 y 80) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sitio confirmado sin gate, y exclusion de semana pasada
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT elem->>'semaphore' FROM jsonb_array_elements(
     (SELECT site_weeks FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16'))
   ) elem WHERE elem->>'group_title' = 'Sitio Confirmed Semana'),
  'green',
  'Test 7: plan confirmed aparece igual (sin gate) — 100% -> verde ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT site_weeks FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16'))
   ) elem WHERE elem->>'group_title' = 'Sitio Semana Pasada'),
  0,
  'Test 8: Sitio Semana Pasada no aparece (fuera de la semana vigente) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 9: no-miembro bajo RLS real
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_like(
  $$ SELECT * FROM public.get_board_operational_agenda_week('ec0e0000-0000-0000-0000-000000000025', '2026-09-16') $$,
  '%No tiene acceso%',
  'Test 9: un no-miembro no puede leer (chequeo propio de get_user_board_role) ✓'
);

SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
