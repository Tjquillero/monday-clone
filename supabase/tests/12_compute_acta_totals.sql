-- =============================================================================
-- Tests: compute_acta_totals() (Incremento 5, Commit 5 — dominio, previo al PDF)
--
-- CONTRATO: supabase/migrations/20260802_compute_acta_totals.sql
-- Fórmula copiada literal del Excel contractual (Acta 36), verificada por
-- el usuario — no un factor único 1.30 como el reporte histórico.
--
-- Cubre: la fórmula exacta (incluido el redondeo del subtotal ANTES de
-- aplicar los porcentajes), un caso límite de redondeo (.5 exacto), acta
-- vacía (subtotal 0), funciona igual en draft e issued, y la revalidación
-- de autorización que exige el bypass de RLS por SECURITY DEFINER.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/12_compute_acta_totals.sql
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
-- Fixtures propios de este archivo (prefijo 707a1500 / 5ca1ab1e).
-- admin = aaaaaaaa-...-000000000001. viewer (no-miembro) = ...-000000000005.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('707a1500-0000-0000-0000-000000000001', 'Test Board Totals', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000301', '707a1500-0000-0000-0000-000000000001', 'Sitio Totals', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('707a1500-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('707a1500-0000-0000-0000-000000000001', 'TOT_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_12(
  p_board_id UUID, p_activity_key TEXT, p_precio_unitario NUMERIC
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Totals')
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

CREATE OR REPLACE FUNCTION _test_seed_closed_execution_12(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE,
  p_executed_qty NUMERIC, p_precio_unitario NUMERIC, p_verified_at TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_activity_id UUID; v_paz_id UUID; v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_12(p_board_id, p_activity_key, p_precio_unitario);

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
-- Test 1-5: caso base — cantidad 33, precio 1000.333 -> valor_total =
-- 33010.989 (33 * 1000.333, NUMERIC exacto). subtotal = ROUND(33010.989, 0)
-- = 33011. Prueba la fórmula completa; el caso límite de redondeo EXACTO
-- en .5 se prueba aparte en Test 6-7.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_acta_id UUID;
BEGIN
  PERFORM _test_seed_closed_execution_12(
    '707a1500-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000301',
    'TOT_001', '2026-12-07', 33, 1000.333, '2026-12-08 09:00:00'
  );
  v_acta_id := public.generate_acta_draft('707a1500-0000-0000-0000-000000000001');
  PERFORM set_config('tot_test.acta_id', v_acta_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT subtotal FROM public.compute_acta_totals(current_setting('tot_test.acta_id')::UUID)),
  33011::NUMERIC,
  'Test 1: subtotal = ROUND(SUM(valor_total), 0) = ROUND(33*1000.333, 0) = 33011 ✓'
);
SELECT is(
  (SELECT administracion FROM public.compute_acta_totals(current_setting('tot_test.acta_id')::UUID)),
  6602::NUMERIC, -- ROUND(33011 * 0.20, 0) = ROUND(6602.2, 0) = 6602
  'Test 2: administracion = ROUND(subtotal * 0.20, 0) = 6602 ✓'
);
SELECT is(
  (SELECT imprevistos FROM public.compute_acta_totals(current_setting('tot_test.acta_id')::UUID)),
  1651::NUMERIC, -- ROUND(33011 * 0.05, 0) = ROUND(1650.55, 0) = 1651
  'Test 3: imprevistos = ROUND(subtotal * 0.05, 0) = 1651 ✓'
);
SELECT is(
  (SELECT utilidad FROM public.compute_acta_totals(current_setting('tot_test.acta_id')::UUID)),
  1651::NUMERIC,
  'Test 4: utilidad = ROUND(subtotal * 0.05, 0) = 1651 (mismo cálculo que imprevistos) ✓'
);
SELECT is(
  (SELECT total_pagar FROM public.compute_acta_totals(current_setting('tot_test.acta_id')::UUID)),
  42915::NUMERIC, -- 33011 + 6602 + 1651 + 1651
  'Test 5: total_pagar = subtotal + administracion + imprevistos + utilidad = 42915 ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6-7: caso límite — el SUBTOTAL mismo cae en .5 exacto, para probar
-- que se redondea ANTES de aplicar los porcentajes (no que "ya era entero
-- porque los datos de hoy lo son"). cantidad 2, precio 1000.25 ->
-- valor_total = 2000.50 -> ROUND(2000.50, 0) = 2001 (mitad-lejos-de-cero).
-- Board separado para no mezclar con el acta_item de Test 1-5 (agregaría
-- al mismo subtotal en vez de aislar el caso).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('707a1500-0000-0000-0000-000000000002', 'Test Board Totals Rounding', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000302', '707a1500-0000-0000-0000-000000000002', 'Sitio Totals Rounding', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('707a1500-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('707a1500-0000-0000-0000-000000000002', 'TOT_002', 'Corte de grama', 'ZONA VERDE', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_acta_id_2 UUID;
BEGIN
  PERFORM _test_seed_closed_execution_12(
    '707a1500-0000-0000-0000-000000000002', '5ca1ab1e-0000-0000-0000-000000000302',
    'TOT_002', '2026-12-07', 2, 1000.25, '2026-12-08 09:00:00'
  );
  v_acta_id_2 := public.generate_acta_draft('707a1500-0000-0000-0000-000000000002');
  PERFORM set_config('tot_test.acta_id_2', v_acta_id_2::TEXT, false);
END;
$$;

SELECT is(
  (SELECT valor_total FROM public.acta_items WHERE acta_id = current_setting('tot_test.acta_id_2')::UUID),
  2000.50::NUMERIC,
  'Fixture: valor_total sin redondear es 2000.50 (2 * 1000.25) ✓'
);
SELECT is(
  (SELECT subtotal FROM public.compute_acta_totals(current_setting('tot_test.acta_id_2')::UUID)),
  2001::NUMERIC,
  'Test 6: subtotal redondea 2000.50 -> 2001 (mitad-lejos-de-cero, igual que Excel), ANTES de aplicar AIU ✓'
);
SELECT is(
  (SELECT administracion FROM public.compute_acta_totals(current_setting('tot_test.acta_id_2')::UUID)),
  400::NUMERIC, -- ROUND(2001 * 0.20, 0) = ROUND(400.2, 0) = 400
  'Test 7: administracion se calcula sobre el subtotal YA redondeado (2001), no sobre 2000.50 ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8: acta vacía (0 líneas) -> todos los totales en 0, sin error.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('707a1500-0000-0000-0000-000000000003', 'Test Board Totals Empty', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('707a1500-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

DO $$
DECLARE v_acta_id_3 UUID;
BEGIN
  v_acta_id_3 := public.generate_acta_draft('707a1500-0000-0000-0000-000000000003');
  PERFORM set_config('tot_test.acta_id_3', v_acta_id_3::TEXT, false);
END;
$$;

SELECT is(
  (SELECT total_pagar FROM public.compute_acta_totals(current_setting('tot_test.acta_id_3')::UUID)),
  0::NUMERIC,
  'Test 8: acta sin líneas -> total_pagar = 0, sin error ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 9: funciona igual tras emitir (issued) — mismo resultado, porque
-- acta_items ya es inmutable una vez issued (el "congelamiento" es
-- consecuencia del invariante existente, no algo nuevo aquí).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  PERFORM public.issue_acta(current_setting('tot_test.acta_id')::UUID);
END;
$$;

SELECT is(
  (SELECT total_pagar FROM public.compute_acta_totals(current_setting('tot_test.acta_id')::UUID)),
  42915::NUMERIC,
  'Test 9: tras emitir el acta, compute_acta_totals sigue devolviendo el mismo total (42915) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 10-11: autorización — consecuencia de SECURITY DEFINER (bypasea RLS,
-- así que la función debe revalidar por sí misma).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  format('SELECT * FROM public.compute_acta_totals(%L)', current_setting('tot_test.acta_id')),
  '%No tiene acceso%',
  'Test 10: un usuario que NO es miembro del board no puede obtener los totales ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_like(
  $$ SELECT * FROM public.compute_acta_totals('00000000-0000-0000-0000-000000000000') $$,
  '%no existe%',
  'Test 11: un acta_id inexistente lanza excepción explícita, no devuelve ceros en silencio ✓'
);

SELECT * FROM finish();
ROLLBACK;
