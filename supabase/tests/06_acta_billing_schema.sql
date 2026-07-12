-- =============================================================================
-- Tests: esquema de facturación del Acta (Incremento 5, Commit 1/N)
--
-- CONTRATO: supabase/migrations/20260727_acta_billing_schema.sql
-- Ref: docs/architecture/acta-billing-design.md.
--
-- Alcance deliberadamente estrecho, igual que la migración: solo mecánica
-- de esquema (PK/FK/NOT NULL/CHECK de una sola fila/UNIQUE/GENERATED). NO
-- se prueba aquí ninguna regla que cruce filas (ej. "SUM(cantidad_consumida)
-- por ejecución no supera la cantidad certificada") — eso pertenece al
-- generador, un incremento posterior.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/06_acta_billing_schema.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(18);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures propios de este archivo (prefijo deadbeef/c0ffee00).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('deadbeef-0000-0000-0000-000000000001', 'Test Board Acta Billing', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('c0ffee00-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000001', 'Sitio Acta Billing', '#00FFFF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_zone_06(
  p_activity_key TEXT, p_precio_unitario NUMERIC DEFAULT 100000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('deadbeef-0000-0000-0000-000000000001', 'POA Test Acta')
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

-- Ejecución real mínima, para probar la FK de acta_item_sources.execution_id.
CREATE OR REPLACE FUNCTION _test_seed_execution_06(p_activity_key TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_activity_id UUID; v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_zone_06(p_activity_key);

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, 'c0ffee00-0000-0000-0000-000000000001', 1000)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('deadbeef-0000-0000-0000-000000000001', 'c0ffee00-0000-0000-0000-000000000001',
          '2026-09-07', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, p_activity_key,
          (SELECT id FROM public.poa_activity_zones WHERE poa_activity_id = v_activity_id AND zone_id = 'c0ffee00-0000-0000-0000-000000000001'),
          10, 4, 'preferred', 100, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-09-07', 2, '2026-09-07 07:00:00', '2026-09-07 15:00:00', 100, 'verified',
          'aaaaaaaa-0000-0000-0000-000000000004', NOW(), 'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO v_exec_id;

  RETURN v_exec_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tests 1-3: actas — creación básica, FK board_id, CHECK numero > 0
-- ─────────────────────────────────────────────────────────────────────────────

SELECT lives_ok(
  $$ INSERT INTO public.actas (board_id, generated_by)
     VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Test 1: crear un acta draft mínima (sin numero, sin fecha) vive ✓'
);

SELECT throws_like(
  $$ INSERT INTO public.actas (board_id, generated_by)
     VALUES ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '%violates foreign key constraint%',
  'Test 2: board_id inexistente viola la FK ✓'
);

SELECT throws_like(
  $$ INSERT INTO public.actas (board_id, generated_by, numero)
     VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 0) $$,
  '%violates check constraint%',
  'Test 3: numero = 0 viola el CHECK (numero > 0) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: UNIQUE(board_id, numero) permite múltiples numero=NULL en
-- boards DISTINTOS (comportamiento estándar de UNIQUE en Postgres).
--
-- Nota (post Commit 2, supabase/migrations/20260728_generate_acta_draft.sql):
-- ya NO se prueba aquí "dos borradores en el MISMO board" — el índice único
-- parcial idx_actas_one_open_draft_per_board de ese commit lo impide
-- deliberadamente (como máximo un draft abierto por board). Ese es ahora un
-- invariante distinto, probado en 07_generate_acta_draft.sql (Test 9), no
-- una consecuencia de UNIQUE(board_id, numero) en sí.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('deadbeef-0000-0000-0000-000000000002', 'Test Board Acta Billing 2', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

SELECT lives_ok(
  $$ INSERT INTO public.actas (board_id, generated_by)
     VALUES ('deadbeef-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Test 4: un borrador (numero NULL) en un board DISTINTO no viola UNIQUE(board_id, numero) ✓'
);

DO $$
DECLARE v_acta_a UUID; v_acta_b UUID;
BEGIN
  -- estado='issued' en ambas: no compiten por el único slot 'draft' del
  -- board (índice de Commit 2) — lo único bajo prueba aquí es
  -- UNIQUE(board_id, numero) en sí.
  INSERT INTO public.actas (board_id, generated_by, numero, estado, issued_by, issued_at)
  VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 501, 'issued', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_acta_a;

  BEGIN
    INSERT INTO public.actas (board_id, generated_by, numero, estado, issued_by, issued_at)
    VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 501, 'issued', 'aaaaaaaa-0000-0000-0000-000000000001', NOW());
    RAISE EXCEPTION 'no debería haber permitido un numero duplicado';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- esperado
  END;
END;
$$;

SELECT pass('Test 5: numero duplicado dentro del mismo board viola UNIQUE(board_id, numero) ✓');

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: CHECK de consistencia interna — estado='issued' exige numero,
-- issued_by e issued_at (todos columnas de la misma fila).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ INSERT INTO public.actas (board_id, generated_by, estado)
     VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'issued') $$,
  '%violates check constraint%',
  'Test 6: estado=issued sin numero/issued_by/issued_at viola el CHECK ✓'
);

SELECT lives_ok(
  $$ INSERT INTO public.actas (board_id, generated_by, estado, numero, issued_by, issued_at)
     VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'issued', 502, 'aaaaaaaa-0000-0000-0000-000000000001', NOW()) $$,
  'Test 7: estado=issued con numero/issued_by/issued_at completos vive ✓'
);

SELECT throws_like(
  $$ INSERT INTO public.actas (board_id, generated_by, estado)
     VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'cancelled') $$,
  '%violates check constraint%',
  'Test 8: un estado fuera de (draft, issued) viola el CHECK ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tests 9-14: acta_items — FK, CHECK, columna GENERATED
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_acta_id UUID; v_activity_id UUID;
BEGIN
  -- estado='issued' (no 'draft'): este fixture no depende de estar en
  -- borrador y el board ya tiene su único slot 'draft' ocupado por el de
  -- Test 1 (índice de Commit 2, idx_actas_one_open_draft_per_board).
  INSERT INTO public.actas (board_id, generated_by, estado, numero, issued_by, issued_at)
  VALUES ('deadbeef-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'issued', 503, 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_acta_id;

  v_activity_id := _test_seed_poa_activity_zone_06('ACTA_ITEM_TEST', 1500);

  INSERT INTO public.acta_items
    (acta_id, poa_activity_id, descripcion_snapshot, unidad_snapshot, precio_unitario_snapshot, cantidad_facturada)
  VALUES (v_acta_id, v_activity_id, 'Poda de árboles', 'UND', 1500, 100);

  PERFORM set_config('acta_billing_test.acta_id', v_acta_id::TEXT, false);
  PERFORM set_config('acta_billing_test.activity_id', v_activity_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT valor_total FROM public.acta_items WHERE acta_id = current_setting('acta_billing_test.acta_id')::UUID),
  150000::NUMERIC,
  'Test 9: valor_total (GENERATED) = cantidad_facturada * precio_unitario_snapshot ✓'
);

SELECT throws_like(
  $$ INSERT INTO public.acta_items
       (acta_id, poa_activity_id, descripcion_snapshot, unidad_snapshot, precio_unitario_snapshot)
     VALUES ('00000000-0000-0000-0000-000000000000',
             (SELECT id FROM public.poa_activities WHERE activity_key = 'ACTA_ITEM_TEST'),
             'x', 'x', 1) $$,
  '%violates foreign key constraint%',
  'Test 10: acta_id inexistente en acta_items viola la FK ✓'
);

SELECT throws_like(
  format(
    $$ INSERT INTO public.acta_items
         (acta_id, poa_activity_id, descripcion_snapshot, unidad_snapshot, precio_unitario_snapshot)
       VALUES (%L, '00000000-0000-0000-0000-000000000000', 'x', 'x', 1) $$,
    current_setting('acta_billing_test.acta_id')
  ),
  '%violates foreign key constraint%',
  'Test 11: poa_activity_id inexistente en acta_items viola la FK ✓'
);

SELECT throws_like(
  format(
    $$ INSERT INTO public.acta_items
         (acta_id, poa_activity_id, descripcion_snapshot, unidad_snapshot, precio_unitario_snapshot)
       VALUES (%L, %L, 'x', 'x', -1) $$,
    current_setting('acta_billing_test.acta_id'), current_setting('acta_billing_test.activity_id')
  ),
  '%violates check constraint%',
  'Test 12: precio_unitario_snapshot negativo viola el CHECK ✓'
);

SELECT throws_like(
  format(
    $$ INSERT INTO public.acta_items
         (acta_id, poa_activity_id, descripcion_snapshot, unidad_snapshot, precio_unitario_snapshot, cantidad_facturada)
       VALUES (%L, %L, 'x', 'x', 1, -1) $$,
    current_setting('acta_billing_test.acta_id'), current_setting('acta_billing_test.activity_id')
  ),
  '%violates check constraint%',
  'Test 13: cantidad_facturada negativa viola el CHECK ✓'
);

SELECT throws_like(
  format(
    $$ INSERT INTO public.acta_items (acta_id, poa_activity_id, unidad_snapshot, precio_unitario_snapshot)
       VALUES (%L, %L, 'x', 1) $$,
    current_setting('acta_billing_test.acta_id'), current_setting('acta_billing_test.activity_id')
  ),
  '%null value in column "descripcion_snapshot"%',
  'Test 14: descripcion_snapshot es NOT NULL ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tests 15-18: acta_item_sources — FK a acta_items y a execution real, CHECK
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_item_id UUID; v_exec_id UUID;
BEGIN
  SELECT id INTO v_item_id FROM public.acta_items
  WHERE acta_id = current_setting('acta_billing_test.acta_id')::UUID
  LIMIT 1;

  v_exec_id := _test_seed_execution_06('ACTA_SOURCE_TEST');

  PERFORM set_config('acta_billing_test.item_id', v_item_id::TEXT, false);
  PERFORM set_config('acta_billing_test.exec_id', v_exec_id::TEXT, false);
END;
$$;

SELECT lives_ok(
  format(
    $$ INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida)
       VALUES (%L, %L, 80) $$,
    current_setting('acta_billing_test.item_id'), current_setting('acta_billing_test.exec_id')
  ),
  'Test 15: acta_item_source válido (80 de una ejecución con 100 certificados) vive ✓'
);

SELECT lives_ok(
  format(
    $$ INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida)
       VALUES (%L, %L, 20) $$,
    current_setting('acta_billing_test.item_id'), current_setting('acta_billing_test.exec_id')
  ),
  'Test 16: una MISMA ejecución puede tener una segunda fila de origen (80+20) — sin trigger de suma en este commit, se permite a nivel de esquema ✓'
);

SELECT throws_like(
  format(
    $$ INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida)
       VALUES ('00000000-0000-0000-0000-000000000000', %L, 1) $$,
    current_setting('acta_billing_test.exec_id')
  ),
  '%violates foreign key constraint%',
  'Test 17: acta_item_id inexistente en acta_item_sources viola la FK ✓'
);

SELECT throws_like(
  format(
    $$ INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida)
       VALUES (%L, %L, 0) $$,
    current_setting('acta_billing_test.item_id'), current_setting('acta_billing_test.exec_id')
  ),
  '%violates check constraint%',
  'Test 18: cantidad_consumida = 0 viola el CHECK (cantidad_consumida > 0) ✓'
);

SELECT * FROM finish();
ROLLBACK;
