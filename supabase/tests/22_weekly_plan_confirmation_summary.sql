-- =============================================================================
-- Tests: get_weekly_plan_confirmation_summary(plan_id)
--
-- CONTRATO: supabase/migrations/20260820_weekly_plan_confirmation_summary.sql
-- Resumen de solo lectura para la pantalla de Confirmación (Cronograma):
-- conteo de ejecuciones por estado + lista de jornadas 'reported' (pendientes
-- de verificación) con su nombre de actividad resuelto igual que el Gate 2
-- (MEVID) de confirm_weekly_plan.
--
-- Cubre: conteos correctos con mezcla de estados; nombre resuelto desde
-- board_activity_standards; fallback a activity_key cuando no hay estándar;
-- plan sin ejecuciones; plan no visible (RLS) → "no encontrado", no un
-- listado vacío silencioso.
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

SELECT plan(12);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0022 / 5ca1ab1e...2201).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000022', 'Test Board Confirmation Summary', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002201', 'ec0e0000-0000-0000-0000-000000000022', 'Zona Confirmación', '#00FFAA', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000022', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

-- Solo CONF_ACT_PEND_A tiene un estándar con nombre propio — CONF_ACT_PEND_B
-- se deja deliberadamente sin estándar para probar el fallback a activity_key.
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ec0e0000-0000-0000-0000-000000000022', 'CONF_ACT_PEND_A', 'Corte de césped', 'ZONA VERDE', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_plan_22(p_week_start DATE)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_plan_id UUID;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('ec0e0000-0000-0000-0000-000000000022', '5ca1ab1e-0000-0000-0000-000000002201',
          p_week_start, 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;
  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION _test_seed_item_execution_22(
  p_plan_id UUID, p_activity_key TEXT, p_execution_date DATE, p_status TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
  v_item_id UUID; v_exec_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('ec0e0000-0000-0000-0000-000000000022', 'POA Test Confirmation')
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
  VALUES (v_activity_id, '5ca1ab1e-0000-0000-0000-000000002201', 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO NOTHING
  RETURNING id INTO v_paz_id;
  IF v_paz_id IS NULL THEN
    SELECT id INTO v_paz_id FROM public.poa_activity_zones WHERE poa_activity_id = v_activity_id AND zone_id = '5ca1ab1e-0000-0000-0000-000000002201';
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
-- Plan con mezcla de estados: 2 verified, 1 rejected, 2 reported (pendientes).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID;
BEGIN
  v_plan_id := _test_seed_plan_22('2026-09-14');
  PERFORM _test_seed_item_execution_22(v_plan_id, 'CONF_ACT_VER_1', '2026-09-14', 'verified');
  PERFORM _test_seed_item_execution_22(v_plan_id, 'CONF_ACT_VER_2', '2026-09-15', 'verified');
  PERFORM _test_seed_item_execution_22(v_plan_id, 'CONF_ACT_REJ_1', '2026-09-16', 'rejected');
  PERFORM _test_seed_item_execution_22(v_plan_id, 'CONF_ACT_PEND_A', '2026-09-17', 'reported');
  PERFORM _test_seed_item_execution_22(v_plan_id, 'CONF_ACT_PEND_B', '2026-09-18', 'reported');
  PERFORM set_config('conf_test.mixed_plan_id', v_plan_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT verified_count FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  2,
  'Test 1: verified_count cuenta exactamente las 2 ejecuciones verified ✓'
);
SELECT is(
  (SELECT rejected_count FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  1,
  'Test 2: rejected_count cuenta exactamente la 1 ejecución rejected ✓'
);
SELECT is(
  (SELECT pending_count FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  2,
  'Test 3: pending_count cuenta exactamente las 2 ejecuciones reported ✓'
);
SELECT is(
  (SELECT jsonb_array_length(pending_executions) FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  2,
  'Test 4: pending_executions trae exactamente 2 elementos (uno por jornada reported) ✓'
);
-- Orden real (verificado contra la collation de la base, no asumido):
-- 'CONF_ACT_PEND_B' < 'Corte de césped' — mayúsculas ordenan antes que
-- minúsculas en la collation de este proyecto, así que el activity_key en
-- mayúsculas (fallback, sin estándar) queda en el índice 0 y el nombre
-- resuelto desde board_activity_standards en el índice 1.
SELECT is(
  (SELECT pending_executions -> 0 ->> 'activity_name' FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  'CONF_ACT_PEND_B',
  'Test 5: sin estándar registrado, activity_name cae al activity_key (mismo fallback que el Gate 2) ✓'
);
SELECT is(
  (SELECT pending_executions -> 1 ->> 'activity_name' FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  'Corte de césped',
  'Test 6: activity_name resuelto desde board_activity_standards (mismo criterio que el Gate 2) ✓'
);
SELECT is(
  (SELECT pending_executions -> 1 ->> 'execution_date' FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID)),
  '2026-09-17',
  'Test 7: execution_date de la jornada pendiente (CONF_ACT_PEND_A) es correcta ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8: plan sin ninguna ejecución → todo en cero, lista vacía (sin error).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID;
BEGIN
  v_plan_id := _test_seed_plan_22('2026-09-21');
  PERFORM set_config('conf_test.empty_plan_id', v_plan_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT verified_count FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.empty_plan_id')::UUID)),
  0,
  'Test 8: plan sin ejecuciones — verified_count = 0 ✓'
);
SELECT is(
  (SELECT rejected_count FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.empty_plan_id')::UUID)),
  0,
  'Test 9: plan sin ejecuciones — rejected_count = 0 ✓'
);
SELECT is(
  (SELECT pending_count FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.empty_plan_id')::UUID)),
  0,
  'Test 10: plan sin ejecuciones — pending_count = 0 ✓'
);
SELECT is(
  (SELECT pending_executions FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.empty_plan_id')::UUID)),
  '[]'::jsonb,
  'Test 11: plan sin ejecuciones — pending_executions = [] (sin error, sin NULL) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 12: un no-miembro no puede leer el plan.
--
-- La función es SECURITY INVOKER (no DEFINER): no tiene ningún chequeo de rol
-- propio, depende enteramente de la RLS de weekly_plans/weekly_plan_items/
-- weekly_plan_item_executions. Como `postgres` tiene BYPASSRLS, esta prueba
-- solo es válida bajo el rol `authenticated` real (mismo patrón que
-- 01_state_machine.sql, Tests 34–36) — sin este cambio de rol, la RLS nunca
-- se ejercita y el test pasaría por la razón equivocada.
-- Sin SAVEPOINT: SET LOCAL ROLE no sobrevive a un ROLLBACK TO.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_like(
  $$ SELECT * FROM public.get_weekly_plan_confirmation_summary(current_setting('conf_test.mixed_plan_id')::UUID) $$,
  '%no encontrado%',
  'Test 12: un no-miembro no ve el plan (RLS bajo authenticated) — "no encontrado", no datos ajenos ✓'
);

SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
