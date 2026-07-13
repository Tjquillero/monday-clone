-- =============================================================================
-- Tests: get_delayed_weekly_plans() (IA)
--
-- CONTRATO: supabase/migrations/20260806_ai_delayed_weekly_plans.sql
--
-- Cubre: un plan con semana vencida y estado != closed aparece; un plan
-- cerrado (closed) NO aparece aunque su semana haya vencido; un plan
-- cancelado (cancelled) NO aparece aunque su semana haya vencido -- fue
-- abortado deliberadamente, nunca fue ni será ejecutado (fix del
-- code-review: 20260818_fix_delayed_weekly_plans_exclude_cancelled.sql);
-- un plan cuya semana todavía no termina NO aparece aunque no esté closed;
-- días de negocio en America/Bogota, no UTC (fix del code-review:
-- 20260819_fix_delayed_weekly_plans_bogota_timezone.sql); days_late
-- correcto; una fila por actividad dentro del plan; autorización.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/16_ai_delayed_weekly_plans.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(11);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo de1a0000 / 5ca1ab1e).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('de1a0000-0000-0000-0000-000000000001', 'Test Board Delayed Plans', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000601', 'de1a0000-0000-0000-0000-000000000001', 'Zona Norte', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('de1a0000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('de1a0000-0000-0000-0000-000000000001', 'DP_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_16(
  p_board_id UUID, p_activity_key TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Delayed Plans')
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

  RETURN v_activity_id;
END;
$$;

DO $$
DECLARE v_activity_id UUID; v_paz_id UUID;
        v_plan_delayed UUID; v_plan_closed UUID; v_plan_future UUID; v_plan_cancelled UUID;
        v_plan_boundary UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_16('de1a0000-0000-0000-0000-000000000001', 'DP_001');
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, '5ca1ab1e-0000-0000-0000-000000000601', 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO NOTHING
  RETURNING id INTO v_paz_id;
  IF v_paz_id IS NULL THEN
    SELECT id INTO v_paz_id FROM public.poa_activity_zones WHERE poa_activity_id = v_activity_id AND zone_id = '5ca1ab1e-0000-0000-0000-000000000601';
  END IF;

  -- Plan 1: semana vencida hace 41 días (week_start hace 47 días, week_end
  -- hace 41), estado 'confirmed' (nunca llegó a closed) -> DEBE aparecer.
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at)
  VALUES ('de1a0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000601',
          (CURRENT_DATE - 47), 1, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_delayed;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_delayed, 1, 'DP_001', v_paz_id, 10, 4, 'preferred', 50, 'und', 2.5);

  -- Plan 2: semana igual de vencida, pero SÍ llegó a 'closed' -> NO debe aparecer.
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('de1a0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000601',
          (CURRENT_DATE - 60), 2, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_closed;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_closed, 1, 'DP_001', v_paz_id, 10, 4, 'preferred', 50, 'und', 2.5);

  -- Plan 3: semana actual (todavía no termina), estado 'in_progress' -> NO
  -- debe aparecer (no está vencida, aunque no esté closed).
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('de1a0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000601',
          CURRENT_DATE, 3, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_future;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_future, 1, 'DP_001', v_paz_id, 10, 4, 'preferred', 50, 'und', 2.5);

  -- Plan 4: semana igual de vencida, pero CANCELADA (abortada) -> NO debe
  -- aparecer. Antes del fix, 'cancelled' <> 'closed' así que sí aparecía.
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('de1a0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000601',
          (CURRENT_DATE - 50), 4, 'cancelled', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_cancelled;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_cancelled, 1, 'DP_001', v_paz_id, 10, 4, 'preferred', 50, 'und', 2.5);

  -- Plan 5: week_end = CURRENT_DATE exacto (relativo, no fecha absoluta --
  -- para que el test no se vuelva frágil con el paso del tiempo real). Sirve
  -- para probar el límite UTC/Bogotá con p_reference_instant construido
  -- también relativo a CURRENT_DATE (ver Tests 8 y 9). 'confirmed' (nunca
  -- closed/cancelled) para que solo dependa de la comparación de fecha.
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at)
  VALUES ('de1a0000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000601',
          (CURRENT_DATE - 6), 1, 'confirmed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_boundary;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_boundary, 1, 'DP_001', v_paz_id, 10, 4, 'preferred', 50, 'und', 2.5);

  PERFORM set_config('dp_test.plan_delayed', v_plan_delayed::TEXT, false);
  PERFORM set_config('dp_test.plan_closed', v_plan_closed::TEXT, false);
  PERFORM set_config('dp_test.plan_future', v_plan_future::TEXT, false);
  PERFORM set_config('dp_test.plan_cancelled', v_plan_cancelled::TEXT, false);
  PERFORM set_config('dp_test.plan_boundary', v_plan_boundary::TEXT, false);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')),
  1,
  'Test 1: solo 1 fila entre los 5 planes — únicamente el vencido y no cerrado (el plan 5 tiene week_end = hoy exacto, todavía no atrasado) ✓'
);
SELECT is(
  (SELECT weekly_plan_id FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')
   WHERE weekly_plan_id = current_setting('dp_test.plan_delayed')::UUID),
  current_setting('dp_test.plan_delayed')::UUID,
  'Test 2: el plan vencido correcto aparece entre los resultados ✓'
);
SELECT is(
  (SELECT status FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')
   WHERE weekly_plan_id = current_setting('dp_test.plan_delayed')::UUID),
  'confirmed',
  'Test 3: el status devuelto es el real del plan (confirmed, nunca llegó a closed) ✓'
);
SELECT is(
  (SELECT days_late FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')
   WHERE weekly_plan_id = current_setting('dp_test.plan_delayed')::UUID),
  41,
  'Test 4: days_late = hoy (America/Bogota) - week_end = 41 (week_start hace 47 días, semana de 7 días) ✓'
);
SELECT is(
  (SELECT activity_name FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')
   WHERE weekly_plan_id = current_setting('dp_test.plan_delayed')::UUID),
  'Poda de árboles',
  'Test 5: activity_name resuelto desde board_activity_standards (mismo patrón que generate_acta_draft) ✓'
);
SELECT is(
  (SELECT zone_name FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')
   WHERE weekly_plan_id = current_setting('dp_test.plan_delayed')::UUID),
  'Zona Norte',
  'Test 6: zone_name = título del group (no se inventó un "código" que no existe en el esquema) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001')
   WHERE weekly_plan_id = current_setting('dp_test.plan_cancelled')::UUID),
  0,
  'Test 7: un plan CANCELADO no aparece aunque su semana haya vencido -- fue abortado, no está atrasado ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Límite UTC/Bogotá (fix del code-review: reproducción determinística con
-- p_reference_instant, independiente del reloj real de la máquina que corre
-- el test).
-- ─────────────────────────────────────────────────────────────────────────────

-- p_reference_instant construido relativo a CURRENT_DATE: (CURRENT_DATE+1)
-- interpretado como medianoche UTC + 2 horas = "01:00/02:00 UTC del día
-- siguiente" -- que en Bogotá (UTC-5) sigue siendo las 19:00-21:00 de HOY.
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_delayed_weekly_plans(
     'de1a0000-0000-0000-0000-000000000001',
     ((CURRENT_DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '2 hours'
   ) WHERE weekly_plan_id = current_setting('dp_test.plan_boundary')::UUID),
  0,
  'Test 8: a las 02:00 UTC del día siguiente (= 21:00 de HOY en Bogotá), un plan cuya semana termina HOY NO está atrasado todavía -- el día de negocio sigue siendo hoy ✓'
);
SELECT is(
  (SELECT days_late FROM public.get_delayed_weekly_plans(
     'de1a0000-0000-0000-0000-000000000001',
     ((CURRENT_DATE + 2)::TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '2 hours'
   ) WHERE weekly_plan_id = current_setting('dp_test.plan_boundary')::UUID),
  1,
  'Test 9: un día de negocio (Bogotá) después, el mismo plan SÍ aparece atrasado, con days_late = 1 ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000001') $$,
  '%No tiene acceso%',
  'Test 10: un no-miembro no puede leer get_delayed_weekly_plans() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Board sin ningún plan: 0 filas, sin error.
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('de1a0000-0000-0000-0000-000000000002', 'Test Board Delayed Plans Empty', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('de1a0000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_delayed_weekly_plans('de1a0000-0000-0000-0000-000000000002')),
  0,
  'Test 11: un board sin planes devuelve 0 filas, sin error ✓'
);

SELECT * FROM finish();
ROLLBACK;
