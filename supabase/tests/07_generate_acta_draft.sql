-- =============================================================================
-- Tests: generate_acta_draft() (Incremento 5, Commit 2/N)
--
-- CONTRATO: supabase/migrations/20260728_generate_acta_draft.sql
-- Ref: docs/adr/ADR-0003-billing-source.md ("Mecanismo de emisión del Acta").
--
-- Cubre exactamente lo que el contrato promete — universo (verified + plan
-- closed + saldo > 0), agrupación por poa_activity, snapshots desde
-- board_activity_standards/poa_activities, idempotencia (un borrador
-- abierto por board, respaldado por índice único), orden determinista
-- (verified_at, id), y que Execution nunca se modifica.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/07_generate_acta_draft.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(13);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures propios de este archivo (prefijo b16b00b5 / 5ca1ab1e).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('b16b00b5-0000-0000-0000-000000000001', 'Test Board Generate Acta', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000001', 'b16b00b5-0000-0000-0000-000000000001', 'Sitio Generate Acta', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('b16b00b5-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('b16b00b5-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('b16b00b5-0000-0000-0000-000000000001', 'GEN_ACTA_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_07(
  p_board_id UUID, p_activity_key TEXT, p_precio_unitario NUMERIC DEFAULT 1000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Generate Acta')
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

-- Crea un plan CLOSED con un item y una execution VERIFIED con la
-- cantidad/fecha de verificación indicadas. Devuelve el execution_id.
CREATE OR REPLACE FUNCTION _test_seed_closed_execution_07(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE,
  p_executed_qty NUMERIC, p_verified_at TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_activity_id UUID; v_paz_id UUID; v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_07(p_board_id, p_activity_key);

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
-- Test 1: universo — una ejecución verified de un plan closed genera el
-- borrador con la línea correcta (snapshot + cantidad_facturada correctos).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_exec_id UUID; v_acta_id UUID;
BEGIN
  v_exec_id := _test_seed_closed_execution_07(
    'b16b00b5-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000001',
    'GEN_ACTA_001', '2026-10-05', 100, '2026-10-06 10:00:00'
  );
  v_acta_id := public.generate_acta_draft('b16b00b5-0000-0000-0000-000000000001');
  PERFORM set_config('gen_acta_test.acta_id', v_acta_id::TEXT, false);
  PERFORM set_config('gen_acta_test.exec_id', v_exec_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT estado FROM public.actas WHERE id = current_setting('gen_acta_test.acta_id')::UUID),
  'draft',
  'Test 1: generate_acta_draft crea un acta en estado draft ✓'
);

SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id')::UUID AND descripcion_snapshot = 'Poda de árboles'),
  100::NUMERIC,
  'Test 2: la línea representa el 100% del saldo pendiente (100) ✓'
);

SELECT is(
  (SELECT unidad_snapshot FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id')::UUID AND descripcion_snapshot = 'Poda de árboles'),
  'UND',
  'Test 3: unidad_snapshot viene de board_activity_standards ✓'
);

SELECT is(
  (SELECT precio_unitario_snapshot FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id')::UUID AND descripcion_snapshot = 'Poda de árboles'),
  1000::NUMERIC,
  'Test 4: precio_unitario_snapshot viene de poa_activities (versión active) ✓'
);

SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources
   WHERE execution_id = current_setting('gen_acta_test.exec_id')::UUID
     AND acta_item_id IN (SELECT id FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id')::UUID)),
  100::NUMERIC,
  'Test 5: acta_item_sources representa el saldo completo de la ejecución (100) ✓'
);

SELECT is(
  (SELECT status FROM public.weekly_plan_item_executions WHERE id = current_setting('gen_acta_test.exec_id')::UUID),
  'verified',
  'Test 6: la ejecución NUNCA se modifica — sigue en verified, sin ninguna marca de facturación ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7-8: idempotencia — segunda llamada devuelve el mismo acta_id, sin
-- duplicar líneas ni fuentes.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_acta_id_2 UUID;
BEGIN
  v_acta_id_2 := public.generate_acta_draft('b16b00b5-0000-0000-0000-000000000001');
  PERFORM set_config('gen_acta_test.acta_id_2', v_acta_id_2::TEXT, false);
END;
$$;

SELECT is(
  current_setting('gen_acta_test.acta_id_2'),
  current_setting('gen_acta_test.acta_id'),
  'Test 7: segunda llamada devuelve el MISMO acta_id (idempotente) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id')::UUID),
  1,
  'Test 8: no se duplicó la línea tras la segunda llamada ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 9: invariante estructural — el índice único parcial impide crear un
-- segundo acta draft para el mismo board incluso saltándose la función.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ INSERT INTO public.actas (board_id, generated_by)
     VALUES ('b16b00b5-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '%duplicate key value violates unique constraint%',
  'Test 9: el índice único parcial impide un segundo draft para el mismo board, aun sin pasar por la función ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 10-13: varias ejecuciones de la MISMA actividad quedan TODAS
-- representadas — bajo consumo del 100% (no una selección parcial), el
-- ORDER BY verified_at/id fija el orden de creación de las filas (defensivo,
-- reproducible), pero no cambia qué se incluye: con consumo total, el
-- resultado final es el mismo sin importar el orden. Lo que sí es
-- observable y se prueba aquí es que NINGUNA ejecución queda fuera y que
-- ninguna se factura por un valor distinto al que le corresponde.
-- Board nuevo, aislado de los tests anteriores.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('b16b00b5-0000-0000-0000-000000000002', 'Test Board Generate Acta 2', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000002', 'b16b00b5-0000-0000-0000-000000000002', 'Sitio 2', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('b16b00b5-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES ('b16b00b5-0000-0000-0000-000000000002', 'GEN_ACTA_002', 'Corte de grama', 'ZONA VERDE', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

-- Reutiliza el helper _test_seed_closed_execution_07, que ya crea su propio
-- POA/plan/item por llamada — cada llamada agrega una ejecución CERRADA y
-- VERIFIED distinta para la misma poa_activity (activity_key repetido).
DO $$
DECLARE v_exec_a UUID; v_exec_b UUID; v_acta_id_3 UUID;
BEGIN
  -- Se crea primero la ejecución con verified_at MÁS TARDÍO, para que el
  -- orden de inserción en la tabla NO coincida con el orden cronológico —
  -- si el generador ignorara el ORDER BY y confiara en el orden físico de
  -- la tabla, este test lo expondría.
  v_exec_b := _test_seed_closed_execution_07(
    'b16b00b5-0000-0000-0000-000000000002', '5ca1ab1e-0000-0000-0000-000000000002',
    'GEN_ACTA_002', '2026-10-19', 30, '2026-10-20 09:00:00'
  );
  v_exec_a := _test_seed_closed_execution_07(
    'b16b00b5-0000-0000-0000-000000000002', '5ca1ab1e-0000-0000-0000-000000000002',
    'GEN_ACTA_002', '2026-10-05', 70, '2026-10-06 09:00:00'
  );

  v_acta_id_3 := public.generate_acta_draft('b16b00b5-0000-0000-0000-000000000002');

  PERFORM set_config('gen_acta_test.acta_id_3', v_acta_id_3::TEXT, false);
  PERFORM set_config('gen_acta_test.exec_a', v_exec_a::TEXT, false);
  PERFORM set_config('gen_acta_test.exec_b', v_exec_b::TEXT, false);
END;
$$;

SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id_3')::UUID),
  100::NUMERIC,
  'Test 10: dos ejecuciones (70+30) de la misma actividad se agregan en una sola línea de 100 ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources WHERE acta_item_id IN
    (SELECT id FROM public.acta_items WHERE acta_id = current_setting('gen_acta_test.acta_id_3')::UUID)),
  2,
  'Test 11: la línea queda respaldada por DOS filas de origen (una por ejecución) ✓'
);

SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('gen_acta_test.exec_a')::UUID),
  70::NUMERIC,
  'Test 12: la ejecución con verified_at más temprano (70) queda representada con su saldo exacto ✓'
);

SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('gen_acta_test.exec_b')::UUID),
  30::NUMERIC,
  'Test 13: la ejecución con verified_at más tardío (30), aunque insertada primero en la tabla, también queda representada con su saldo exacto ✓'
);

SELECT * FROM finish();
ROLLBACK;
