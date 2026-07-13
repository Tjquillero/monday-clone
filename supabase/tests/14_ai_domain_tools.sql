-- =============================================================================
-- Tests: get_acta_summary() y get_pending_billable_work() (IA, Fase 1 Hito 1+2)
--
-- CONTRATO: supabase/migrations/20260804_ai_domain_tools.sql
--
-- Cubre: get_acta_summary envuelve compute_acta_totals sin recalcular AIU
-- (mismos números que Test 1-5 de 12_compute_acta_totals.sql, más cabecera);
-- get_pending_billable_work replica la elegibilidad de generate_acta_draft
-- (verified + closed + saldo > 0); autorización en ambas.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/14_ai_domain_tools.sql
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
-- Fixtures (prefijo d0ba1000 / 5ca1ab1e).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('d0ba1000-0000-0000-0000-000000000001', 'Test Board AI Domain Tools', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000401', 'd0ba1000-0000-0000-0000-000000000001', 'Sitio AI Domain Tools', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('d0ba1000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('d0ba1000-0000-0000-0000-000000000001', 'AIT_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test'),
  ('d0ba1000-0000-0000-0000-000000000001', 'AIT_002', 'Corte de grama', 'ZONA VERDE', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_14(
  p_board_id UUID, p_activity_key TEXT, p_precio_unitario NUMERIC
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test AI Domain Tools')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, 4, p_precio_unitario)
  ON CONFLICT (poa_version_id, activity_key) DO UPDATE SET precio_unitario = EXCLUDED.precio_unitario
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION _test_seed_closed_execution_14(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE,
  p_executed_qty NUMERIC, p_precio_unitario NUMERIC, p_verified_at TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_activity_id UUID; v_paz_id UUID; v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_14(p_board_id, p_activity_key, p_precio_unitario);

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_group_id, 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada
  RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES (p_board_id, p_group_id,
          p_week_start, 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, p_activity_key, v_paz_id, 10, 4, 'preferred', p_executed_qty, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, p_week_start, 2, (p_week_start::TEXT || ' 07:00:00')::TIMESTAMPTZ, (p_week_start::TEXT || ' 15:00:00')::TIMESTAMPTZ,
          p_executed_qty, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', p_verified_at, 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_id;

  RETURN v_exec_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_acta_summary — Test 1-5.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_acta_id UUID;
BEGIN
  PERFORM _test_seed_closed_execution_14(
    'd0ba1000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000401',
    'AIT_001', '2026-12-07', 33, 1000.333, '2026-12-08 09:00:00'
  );
  v_acta_id := public.generate_acta_draft('d0ba1000-0000-0000-0000-000000000001');
  PERFORM public.issue_acta(v_acta_id);
  PERFORM set_config('ai_dt_test.acta_id', v_acta_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT numero FROM public.get_acta_summary(current_setting('ai_dt_test.acta_id')::UUID)),
  1,
  'Test 1: get_acta_summary() devuelve el numero correcto (primera acta del board) ✓'
);
SELECT is(
  (SELECT estado FROM public.get_acta_summary(current_setting('ai_dt_test.acta_id')::UUID)),
  'issued',
  'Test 2: get_acta_summary() devuelve el estado correcto ✓'
);
SELECT is(
  (SELECT subtotal FROM public.get_acta_summary(current_setting('ai_dt_test.acta_id')::UUID)),
  33011::NUMERIC,
  'Test 3: get_acta_summary() coincide con compute_acta_totals() — mismo subtotal (33011), sin recalcular ✓'
);
SELECT is(
  (SELECT total_pagar FROM public.get_acta_summary(current_setting('ai_dt_test.acta_id')::UUID)),
  42915::NUMERIC,
  'Test 4: get_acta_summary() coincide con compute_acta_totals() — mismo total_pagar (42915) ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  format('SELECT * FROM public.get_acta_summary(%L)', current_setting('ai_dt_test.acta_id')),
  '%acceso%',
  'Test 5: un no-miembro no puede leer get_acta_summary() (la autorización de compute_acta_totals() protege también aquí) ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- ─────────────────────────────────────────────────────────────────────────────
-- get_pending_billable_work — Test 6-11. Dos actividades, una completamente
-- facturada (saldo 0, no debe contar) y otra con saldo pendiente real.
-- ─────────────────────────────────────────────────────────────────────────────

-- AIT_002: ejecución NUEVA, todavía sin facturar — debe aparecer en el pendiente.
DO $$
BEGIN
  PERFORM _test_seed_closed_execution_14(
    'd0ba1000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000401',
    'AIT_002', '2026-12-14', 50, 2000, '2026-12-15 09:00:00'
  );
END;
$$;

SELECT is(
  (SELECT activities FROM public.get_pending_billable_work('d0ba1000-0000-0000-0000-000000000001')),
  1,
  'Test 6: get_pending_billable_work() cuenta solo la actividad con saldo pendiente (AIT_001 ya está 100% facturada en el acta issued) ✓'
);
SELECT is(
  (SELECT executions FROM public.get_pending_billable_work('d0ba1000-0000-0000-0000-000000000001')),
  1,
  'Test 7: get_pending_billable_work() cuenta 1 ejecución pendiente (la de AIT_002) ✓'
);
SELECT is(
  (SELECT estimated_value FROM public.get_pending_billable_work('d0ba1000-0000-0000-0000-000000000001')),
  100000::NUMERIC, -- 50 * 2000
  'Test 8: get_pending_billable_work() calcula el valor estimado correcto (50 * 2000 = 100000) ✓'
);
SELECT is(
  (SELECT currency FROM public.get_pending_billable_work('d0ba1000-0000-0000-0000-000000000001')),
  'COP',
  'Test 9: get_pending_billable_work() devuelve la moneda (COP, hardcoded — el resto del sistema no maneja otra) ✓'
);

-- Board sin nada pendiente: todo en cero, sin error.
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('d0ba1000-0000-0000-0000-000000000002', 'Test Board AI Domain Tools Empty', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('d0ba1000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT estimated_value FROM public.get_pending_billable_work('d0ba1000-0000-0000-0000-000000000002')),
  0::NUMERIC,
  'Test 10: un board sin ejecuciones pendientes devuelve 0, sin error ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_pending_billable_work('d0ba1000-0000-0000-0000-000000000001') $$,
  '%No tiene acceso%',
  'Test 11: un no-miembro no puede leer get_pending_billable_work() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
