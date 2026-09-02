-- =============================================================================
-- Test 17: Invariante de Snapshot Contractual del Acta frente a Versiones del POA
--
-- CONTRATO: ADR-0003-billing-source.md
--
-- Caso Central de Aceptación:
-- 1. Se crea POA v1 con precio $10.000.
-- 2. Se verifica ejecución, se genera borrador y se emite el Acta #1 (Snapshot = $10.000).
-- 3. Se activa POA v2 con precio $12.000.
-- 4. El borrador nuevo para un período posterior adopta $12.000 (POA v2 active).
-- 5. El Acta #1 emitida PERMANECE 100% INMUTABLE con su snapshot de $10.000 (POA v1).
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

-- Fixtures de prueba
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('e1551e00-0000-0000-0000-000000000017', 'Test Board Snapshot Invariant', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000117', 'e1551e00-0000-0000-0000-000000000017', 'Sitio Invariant Test', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('e1551e00-0000-0000-0000-000000000017', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('e1551e00-0000-0000-0000-000000000017', 'ACT_SNAP_01', 'Poda y Mantenimiento', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

-- 1. Crear POA v1 y actividad con precio $10,000
DO $$
DECLARE
  v_poa_id UUID; v_v1_id UUID; v_act1_id UUID; v_paz1_id UUID; v_plan1_id UUID; v_item1_id UUID; v_exec1_id UUID; v_acta1_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('e1551e00-0000-0000-0000-000000000017', 'POA Test Snapshot')
  RETURNING id INTO v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_v1_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1_id, 'ACT_SNAP_01', 4, 10000)
  RETURNING id INTO v_act1_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act1_id, '5ca1ab1e-0000-0000-0000-000000000117', 1000)
  RETURNING id INTO v_paz1_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000017', '5ca1ab1e-0000-0000-0000-000000000117',
          '2026-10-05', 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan1_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan1_id, 1, 'ACT_SNAP_01', v_paz1_id, 10, 4, 'preferred', 100, 'und', 2.5)
  RETURNING id INTO v_item1_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item1_id, '2026-10-05', 2, '2026-10-05 07:00:00', '2026-10-05 15:00:00',
          100, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec1_id;

  -- Generar borrador 1 y emitir Acta #1
  v_acta1_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000017');
  PERFORM public.issue_acta(v_acta1_id);
  PERFORM set_config('snap_test.acta1_id', v_acta1_id::TEXT, false);
  PERFORM set_config('snap_test.poa_id', v_poa_id::TEXT, false);
END;
$$;

-- Test 1: El Acta 1 emitida tiene precio_unitario_snapshot = 10,000 y valor_total = 1,000,000 (100 * 10,000)
SELECT is(
  (SELECT precio_unitario_snapshot FROM public.acta_items WHERE acta_id = current_setting('snap_test.acta1_id')::UUID),
  10000::NUMERIC,
  'Test 1: Acta #1 emitida toma precio de POA v1 ($10,000) ✓'
);

SELECT is(
  (SELECT valor_total FROM public.acta_items WHERE acta_id = current_setting('snap_test.acta1_id')::UUID),
  1000000::NUMERIC,
  'Test 2: Acta #1 emitida congela el valor total de $1,000,000 ✓'
);

-- 2. Activar POA v2 con precio $12,000 y crear nueva ejecución para semana 2
DO $$
DECLARE
  v_poa_id UUID; v_v2_id UUID; v_act2_id UUID; v_paz2_id UUID; v_plan2_id UUID; v_item2_id UUID; v_acta2_id UUID;
BEGIN
  v_poa_id := current_setting('snap_test.poa_id')::UUID;

  -- Desactivar v1 y crear v2 activa con precio $12,000
  UPDATE public.poa_versions SET status = 'archived' WHERE poa_id = v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 2, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_v2_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v2_id, 'ACT_SNAP_01', 4, 12000)
  RETURNING id INTO v_act2_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act2_id, '5ca1ab1e-0000-0000-0000-000000000117', 1000)
  RETURNING id INTO v_paz2_id;

  -- Crear semana 2 cerrada con ejecuciones verificadas
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000017', '5ca1ab1e-0000-0000-0000-000000000017',
          '2026-10-12', 2, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan2_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan2_id, 1, 'ACT_SNAP_01', v_paz2_id, 10, 4, 'preferred', 50, 'und', 1.25)
  RETURNING id INTO v_item2_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item2_id, '2026-10-12', 2, '2026-10-12 07:00:00', '2026-10-12 15:00:00',
          50, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001');

  -- Generar Borrador 2 bajo POA v2 activo
  v_acta2_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000017');
  PERFORM set_config('snap_test.acta2_id', v_acta2_id::TEXT, false);
END;
$$;

-- Test 3: El nuevo Borrador 2 calcula sobre el POA v2 activo ($12,000)
SELECT is(
  (SELECT precio_unitario_snapshot FROM public.acta_items WHERE acta_id = current_setting('snap_test.acta2_id')::UUID),
  12000::NUMERIC,
  'Test 3: Nuevo Borrador 2 calcula con el precio de POA v2 active ($12,000) ✓'
);

-- Test 4: INVARIANTE CENTRAL: El Acta #1 emitida PERMANECE INMUTABLE con $10,000
SELECT is(
  (SELECT precio_unitario_snapshot FROM public.acta_items WHERE acta_id = current_setting('snap_test.acta1_id')::UUID),
  10000::NUMERIC,
  'Test 4: INVARIANTE — Acta #1 emitida mantiene inalterado su precio snapshot de $10,000 ✓'
);

SELECT is(
  (SELECT valor_total FROM public.acta_items WHERE acta_id = current_setting('snap_test.acta1_id')::UUID),
  1000000::NUMERIC,
  'Test 5: INVARIANTE — Acta #1 emitida mantiene su valor total de $1,000,000 sin sufrir recálculos por POA v2 ✓'
);

SELECT * FROM finish();
ROLLBACK;
