-- =============================================================================
-- Tests: gate de configuración técnica en confirm_weekly_plan (ERRCODE MTCFG)
--
-- CONTRATO: supabase/migrations/20260827_confirm_weekly_plan_technical_config_gate.sql
-- Decisión de negocio (2026-07-19, ver docs/architecture/
-- poa-technical-catalog-decoupling.md): el Cronograma se genera de forma
-- PARCIAL cuando faltan actividades en el Catálogo Técnico — el bloqueo real
-- vive en confirm_weekly_plan(), chequeado EN VIVO contra
-- get_missing_board_activity_standards(), NUNCA como una bandera guardada
-- en el plan. El Test 3 es el más importante de este archivo: prueba
-- exactamente esa propiedad (derivado, no persistido).
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

SELECT plan(5);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0028 / 5ca1ab1e...28NN)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000028', 'Test Board MTCFG Gate', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('ec0e0000-0000-0000-0000-000000000028', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('ec0e0000-0000-0000-0000-000000000028', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002801', 'ec0e0000-0000-0000-0000-000000000028', 'Sitio MTCFG', '#3B7EF8', 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_set_user_28(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user_id)::TEXT, true);
$$;

-- Helper DELIBERADAMENTE sin insertar board_activity_standards — a
-- diferencia de 01/02, este archivo necesita que la actividad quede SIN
-- catálogo técnico para poder probar el gate.
CREATE OR REPLACE FUNCTION _test_seed_poa_activity_zone_28(
  p_activity_key TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_zone_row_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('ec0e0000-0000-0000-0000-000000000028', 'POA Test MTCFG')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, description, unit, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, 'Actividad MTCFG de prueba', 'und', 4, 100000)
  ON CONFLICT (poa_version_id, activity_key) DO NOTHING
  RETURNING id INTO v_activity_id;
  IF v_activity_id IS NULL THEN
    SELECT id INTO v_activity_id FROM public.poa_activities WHERE poa_version_id = v_version_id AND activity_key = p_activity_key;
  END IF;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, '5ca1ab1e-0000-0000-0000-000000002801', 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO NOTHING
  RETURNING id INTO v_zone_row_id;
  IF v_zone_row_id IS NULL THEN
    SELECT id INTO v_zone_row_id FROM public.poa_activity_zones WHERE poa_activity_id = v_activity_id AND zone_id = '5ca1ab1e-0000-0000-0000-000000002801';
  END IF;

  RETURN v_zone_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION _test_seed_plan_28(
  p_week_start DATE, p_activity_key TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_paz_id UUID; v_plan_id UUID;
BEGIN
  v_paz_id := _test_seed_poa_activity_zone_28(p_activity_key);

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('ec0e0000-0000-0000-0000-000000000028', '5ca1ab1e-0000-0000-0000-000000002801',
          p_week_start, 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, p_activity_key, v_paz_id, 10, 4, 'preferred', 100, 'und', 2.5);

  RETURN v_plan_id;
END;
$$;

SELECT _test_set_user_28('aaaaaaaa-0000-0000-0000-000000000002'); -- assistant

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1-2: actividad SIN board_activity_standards -> confirm rechazado con MTCFG
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_ok BOOLEAN := FALSE; v_sqlstate TEXT; v_msg TEXT; v_detail TEXT;
BEGIN
  v_plan_id := _test_seed_plan_28('2026-09-07', 'MTCFG_ACT_001');

  BEGIN
    PERFORM public.confirm_weekly_plan(v_plan_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    v_ok := (v_sqlstate = 'MTCFG' AND v_msg LIKE '%1 actividad%' AND v_detail LIKE '%MTCFG_ACT_001%');
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 1: debió fallar con ERRCODE=MTCFG, mensaje "1 actividad" y DETAIL con MTCFG_ACT_001; sqlstate=%, msg=%, detail=%', v_sqlstate, v_msg, v_detail;
  END IF;
END;
$$;

SELECT pass('Test 1: actividad contratada sin catálogo técnico -> confirm rechazado con ERRCODE=MTCFG y mensaje con el conteo exacto ✓');

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE board_id = 'ec0e0000-0000-0000-0000-000000000028' AND week_start = '2026-09-07'),
  'in_progress',
  'Test 2: el plan permanece in_progress tras el rechazo — no se confirmó nada ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3 (EL MÁS IMPORTANTE): completar el catálogo técnico SIN tocar el
-- plan -> el MISMO plan ahora se puede confirmar. Prueba que "parcial" es
-- derivado en vivo, nunca una bandera persistida.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
VALUES ('ec0e0000-0000-0000-0000-000000000028', 'MTCFG_ACT_001', 'Actividad MTCFG de prueba', 'ZONA VERDE', 'und', 500);

DO $$
DECLARE v_plan_id UUID;
BEGIN
  SELECT id INTO v_plan_id FROM public.weekly_plans WHERE board_id = 'ec0e0000-0000-0000-0000-000000000028' AND week_start = '2026-09-07';
  PERFORM public.confirm_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE board_id = 'ec0e0000-0000-0000-0000-000000000028' AND week_start = '2026-09-07'),
  'confirmed',
  'Test 3: completar el catálogo técnico (sin recrear el plan) permite confirmar el mismo plan — "parcial" es derivado, no persistido ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: actividad que YA tiene catálogo técnico desde el principio -> confirm
-- funciona directo, sin pasar nunca por el estado rechazado (control positivo).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
VALUES ('ec0e0000-0000-0000-0000-000000000028', 'MTCFG_ACT_002', 'Actividad MTCFG dos', 'ZONA VERDE', 'und', 500);

DO $$
DECLARE v_plan_id UUID;
BEGIN
  v_plan_id := _test_seed_plan_28('2026-09-14', 'MTCFG_ACT_002');
  PERFORM public.confirm_weekly_plan(v_plan_id);
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE board_id = 'ec0e0000-0000-0000-0000-000000000028' AND week_start = '2026-09-14'),
  'confirmed',
  'Test 4: actividad con catálogo técnico completo desde el inicio -> confirm funciona directo ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: board sin ninguna poa_version activa -> el gate no aplica (no hay
-- nada contra qué comparar), confirm sigue funcionando por los demás gates.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000029', 'Test Board Sin POA MTCFG', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000029', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002901', 'ec0e0000-0000-0000-0000-000000000029', 'Sitio Sin POA', '#444444', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.weekly_plans (id, board_id, group_id, week_start, period_number, status, created_by)
VALUES ('5ca1ab1e-0000-0000-0000-0000000029aa', 'ec0e0000-0000-0000-0000-000000000029', '5ca1ab1e-0000-0000-0000-000000002901',
        '2026-09-07', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  PERFORM public.confirm_weekly_plan('5ca1ab1e-0000-0000-0000-0000000029aa');
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plans WHERE id = '5ca1ab1e-0000-0000-0000-0000000029aa'),
  'confirmed',
  'Test 5: board sin poa_version activa -> el gate MTCFG no aplica, confirm funciona ✓'
);

SELECT * FROM finish();
ROLLBACK;
