-- =============================================================================
-- Tests: adjust_acta_item_quantity() (Incremento 5, Commit 4 — dominio)
--
-- CONTRATO: supabase/migrations/20260801_adjust_acta_item_quantity.sql
-- Ref: docs/adr/ADR-0003-billing-source.md ("Mecanismo de emisión del Acta").
--
-- Cubre: autorización (solo admin), solo acta draft, solo reducción
-- (0 <= p_cantidad <= actual), y el criterio LIFO de liberación — inverso
-- exacto al orden de asignación de generate_acta_draft() (verified_at ASC),
-- probado con 3 ejecuciones para que el orden sea observable sin ambigüedad.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/11_adjust_acta_item_quantity.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(14);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures propios de este archivo (prefijo ad905730 / 5ca1ab1e).
-- Tres ejecuciones VERIFIED de la MISMA actividad, verified_at creciente:
--   exec1 (más antigua)  = 30
--   exec2 (intermedia)   = 40
--   exec3 (más reciente) = 30
-- generate_acta_draft() las agrega en una sola línea: cantidad_facturada = 100.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ad905730-0000-0000-0000-000000000001', 'Test Board Adjust Acta', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000201', 'ad905730-0000-0000-0000-000000000001', 'Sitio Adjust Acta', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('ad905730-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('ad905730-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ad905730-0000-0000-0000-000000000001', 'ADJ_ACTA_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_11(
  p_board_id UUID, p_activity_key TEXT, p_precio_unitario NUMERIC DEFAULT 1000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Adjust Acta')
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

CREATE OR REPLACE FUNCTION _test_seed_closed_execution_11(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE,
  p_executed_qty NUMERIC, p_verified_at TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_activity_id UUID; v_paz_id UUID; v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_11(p_board_id, p_activity_key);

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

DO $$
DECLARE v_exec1 UUID; v_exec2 UUID; v_exec3 UUID; v_acta_id UUID; v_item_id UUID;
BEGIN
  v_exec1 := _test_seed_closed_execution_11(
    'ad905730-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000201',
    'ADJ_ACTA_001', '2026-11-02', 30, '2026-11-03 09:00:00'
  );
  v_exec2 := _test_seed_closed_execution_11(
    'ad905730-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000201',
    'ADJ_ACTA_001', '2026-11-09', 40, '2026-11-10 09:00:00'
  );
  v_exec3 := _test_seed_closed_execution_11(
    'ad905730-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000201',
    'ADJ_ACTA_001', '2026-11-16', 30, '2026-11-17 09:00:00'
  );

  v_acta_id := public.generate_acta_draft('ad905730-0000-0000-0000-000000000001');
  SELECT id INTO v_item_id FROM public.acta_items WHERE acta_id = v_acta_id;

  PERFORM set_config('adj_acta_test.acta_id', v_acta_id::TEXT, false);
  PERFORM set_config('adj_acta_test.item_id', v_item_id::TEXT, false);
  PERFORM set_config('adj_acta_test.exec1', v_exec1::TEXT, false);
  PERFORM set_config('adj_acta_test.exec2', v_exec2::TEXT, false);
  PERFORM set_config('adj_acta_test.exec3', v_exec3::TEXT, false);
END;
$$;

SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE id = current_setting('adj_acta_test.item_id')::UUID),
  100::NUMERIC,
  'Fixture: la línea arranca en 100 (30+40+30, tres ejecuciones) ✓'
);

-- Test 1: un no-admin no puede ajustar.
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', false);
SELECT throws_like(
  format('SELECT public.adjust_acta_item_quantity(%L, 65)', current_setting('adj_acta_test.item_id')),
  '%administradores%',
  'Test 1: un no-admin no puede ajustar la cantidad ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);

-- Test 2: cantidad negativa se rechaza.
SELECT throws_like(
  format('SELECT public.adjust_acta_item_quantity(%L, -1)', current_setting('adj_acta_test.item_id')),
  '%Cantidad inválida%',
  'Test 2: una cantidad negativa es rechazada ✓'
);

-- Test 3: un aumento (por encima de la cantidad actual) se rechaza — solo reducción.
SELECT throws_like(
  format('SELECT public.adjust_acta_item_quantity(%L, 150)', current_setting('adj_acta_test.item_id')),
  '%Cantidad inválida%',
  'Test 3: un aumento por encima de la cantidad actual es rechazado (solo reducción) ✓'
);

-- Test 4-8: reducción 100 -> 65 (delta 35). LIFO libera primero exec3 (30,
-- la más reciente) por completo, luego 5 de exec2 (40 -> 35). exec1 (30,
-- la más antigua) queda intacta.
SELECT public.adjust_acta_item_quantity(current_setting('adj_acta_test.item_id')::UUID, 65);

SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE id = current_setting('adj_acta_test.item_id')::UUID),
  65::NUMERIC,
  'Test 4: la línea queda en 65 tras la reducción ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources WHERE execution_id = current_setting('adj_acta_test.exec3')::UUID),
  0,
  'Test 5: LIFO — la fuente de la ejecución MÁS RECIENTE (exec3, 30) se eliminó por completo ✓'
);

SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('adj_acta_test.exec2')::UUID),
  35::NUMERIC,
  'Test 6: LIFO — la fuente intermedia (exec2) se redujo parcialmente de 40 a 35 (delta restante 5) ✓'
);

SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('adj_acta_test.exec1')::UUID),
  30::NUMERIC,
  'Test 7: LIFO — la fuente MÁS ANTIGUA (exec1, 30) queda intacta — es la última en liberarse ✓'
);

SELECT is(
  (SELECT COALESCE(SUM(cantidad_consumida), 0) FROM public.acta_item_sources WHERE acta_item_id = current_setting('adj_acta_test.item_id')::UUID),
  65::NUMERIC,
  'Test 8: invariante — SUM(acta_item_sources) sigue igual a cantidad_facturada (65) tras el ajuste ✓'
);

-- Test 9: nunca modifica weekly_plan_item_executions.
SELECT is(
  (SELECT executed_qty FROM public.weekly_plan_item_executions WHERE id = current_setting('adj_acta_test.exec2')::UUID),
  40::NUMERIC,
  'Test 9: la ejecución NUNCA se modifica — executed_qty sigue en 40 (su cantidad certificada real) ✓'
);

-- Test 10-11: segunda reducción, 65 -> 0. LIFO agota exec2 (35) y luego
-- exec1 (30) — ambas fuentes restantes desaparecen.
SELECT public.adjust_acta_item_quantity(current_setting('adj_acta_test.item_id')::UUID, 0);

SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE id = current_setting('adj_acta_test.item_id')::UUID),
  0::NUMERIC,
  'Test 10: reducir a 0 dejar la línea en 0 ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources WHERE acta_item_id = current_setting('adj_acta_test.item_id')::UUID),
  0,
  'Test 11: reducir a 0 elimina TODAS las fuentes restantes (exec1 y exec2) ✓'
);

-- Test 12: sobre un acta ya emitida, el ajuste es rechazado (estado != draft).
-- Board SEPARADO: el board principal todavía tiene abierto el draft (ahora
-- vacío) de los Tests 1-11 — generate_acta_draft() es idempotente y lo
-- devolvería tal cual en vez de crear uno nuevo con exec4.
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ad905730-0000-0000-0000-000000000002', 'Test Board Adjust Acta 2', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000202', 'ad905730-0000-0000-0000-000000000002', 'Sitio Adjust Acta 2', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ad905730-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ad905730-0000-0000-0000-000000000002', 'ADJ_ACTA_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_exec4 UUID; v_acta_id_2 UUID; v_item_id_2 UUID;
BEGIN
  v_exec4 := _test_seed_closed_execution_11(
    'ad905730-0000-0000-0000-000000000002', '5ca1ab1e-0000-0000-0000-000000000202',
    'ADJ_ACTA_001', '2026-11-23', 50, '2026-11-24 09:00:00'
  );
  v_acta_id_2 := public.generate_acta_draft('ad905730-0000-0000-0000-000000000002');
  PERFORM public.issue_acta(v_acta_id_2);
  SELECT id INTO v_item_id_2 FROM public.acta_items WHERE acta_id = v_acta_id_2;
  PERFORM set_config('adj_acta_test.item_id_2', v_item_id_2::TEXT, false);
END;
$$;

SELECT throws_like(
  format('SELECT public.adjust_acta_item_quantity(%L, 10)', current_setting('adj_acta_test.item_id_2')),
  '%no está en estado draft%',
  'Test 12: ajustar una línea de un acta ya issued es rechazado ✓'
);

-- Test 13: idempotencia trivial — ajustar a la cantidad ya actual no falla
-- y no cambia nada.
SELECT lives_ok(
  $$ SELECT public.adjust_acta_item_quantity(
       (SELECT id FROM public.acta_items WHERE acta_id = current_setting('adj_acta_test.acta_id')::UUID), 0
     ) $$,
  'Test 13: ajustar a la cantidad ya vigente (0 -> 0) no lanza error (no-op) ✓'
);

SELECT * FROM finish();
ROLLBACK;
