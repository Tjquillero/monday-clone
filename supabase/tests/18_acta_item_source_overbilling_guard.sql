-- =============================================================================
-- Test 18: Trazabilidad, Consumo Único y Protecciones de Sobrefacturación en ActaItemSource
--
-- CONTRATO: ADR-0003-billing-source.md
-- Ref: supabase/migrations/20260902_enforce_acta_item_source_overbilling_guard.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(6);

-- Fixtures de prueba
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('e1551e00-0000-0000-0000-000000000018', 'Test Board Overbilling Guard', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000118', 'e1551e00-0000-0000-0000-000000000018', 'Sitio Overbilling Test', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('e1551e00-0000-0000-0000-000000000018', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('e1551e00-0000-0000-0000-000000000018', 'ACT_OVER_01', 'Mantenimiento de Jardines', 'ZONA VERDE', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

-- Seed POA y Ejecución con executed_qty = 80
DO $$
DECLARE
  v_poa_id UUID; v_v1_id UUID; v_act1_id UUID; v_paz1_id UUID; v_plan1_id UUID; v_item1_id UUID; v_exec1_id UUID; v_acta1_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('e1551e00-0000-0000-0000-000000000018', 'POA Overbilling Test')
  RETURNING id INTO v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_v1_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1_id, 'ACT_OVER_01', 4, 5000)
  RETURNING id INTO v_act1_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act1_id, '5ca1ab1e-0000-0000-0000-000000000118', 1000)
  RETURNING id INTO v_paz1_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000018', '5ca1ab1e-0000-0000-0000-000000000118',
          '2026-10-19', 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan1_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan1_id, 1, 'ACT_OVER_01', v_paz1_id, 10, 4, 'preferred', 80, 'm2', 2.0)
  RETURNING id INTO v_item1_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item1_id, '2026-10-19', 2, '2026-10-19 07:00:00', '2026-10-19 15:00:00',
          80, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec1_id;

  -- Generar Borrador #1 y emitirlo
  v_acta1_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000018');
  PERFORM public.issue_acta(v_acta1_id);

  PERFORM set_config('over_test.acta1_id', v_acta1_id::TEXT, false);
  PERFORM set_config('over_test.exec1_id', v_exec1_id::TEXT, false);
END;
$$;

-- Test 1: Trazabilidad completa — ActaItemSource vincula la ejecución 1 con la cantidad consumida 80
SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('over_test.exec1_id')::UUID),
  80::NUMERIC,
  'Test 1: ActaItemSource registra exactamente 80 m2 consumidos de la ejecución 1 ✓'
);

-- Test 2: Intento de insertar manualmente una fuente excedente falla por el trigger de sobrefacturación
SELECT throws_like(
  format(
    'INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida) VALUES ((SELECT id FROM public.acta_items WHERE acta_id = %L), %L, 10)',
    current_setting('over_test.acta1_id'),
    current_setting('over_test.exec1_id')
  ),
  '%Sobrefacturación detectada%',
  'Test 2: Trigger rejacta cualquier intento de insertar sobrefacturación por encima de executed_qty ✓'
);

-- 3. Crear semana 2 y verificar que la ejecución 1 NO vuelve a ser incluida en un nuevo Borrador 2
DO $$
DECLARE
  v_plan2_id UUID; v_item2_id UUID; v_exec2_id UUID; v_acta2_id UUID;
  v_paz_id UUID;
BEGIN
  SELECT paz.id INTO v_paz_id
  FROM public.poa_activity_zones paz
  JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
  WHERE pa.activity_key = 'ACT_OVER_01';

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000018', '5ca1ab1e-0000-0000-0000-000000000118',
          '2026-10-26', 2, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan2_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan2_id, 1, 'ACT_OVER_01', v_paz_id, 10, 4, 'preferred', 30, 'm2', 0.75)
  RETURNING id INTO v_item2_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item2_id, '2026-10-26', 2, '2026-10-26 07:00:00', '2026-10-26 15:00:00',
          30, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec2_id;

  -- Generar Borrador #2
  v_acta2_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000018');

  PERFORM set_config('over_test.acta2_id', v_acta2_id::TEXT, false);
  PERFORM set_config('over_test.exec2_id', v_exec2_id::TEXT, false);
END;
$$;

-- Test 3: El Borrador #2 contiene solo 30 m2 (de la ejec 2), NO duplica los 80 m2 de la ejec 1
SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE acta_id = current_setting('over_test.acta2_id')::UUID),
  30::NUMERIC,
  'Test 3: Borrador #2 incluye solo los 30 m2 pendientes y excluye la ejecución 1 ya facturada ✓'
);

-- Test 4: ActaItemSource del Borrador #2 referencia unicamente la ejecucion 2
SELECT is(
  (SELECT execution_id FROM public.acta_item_sources WHERE acta_item_id IN (SELECT id FROM public.acta_items WHERE acta_id = current_setting('over_test.acta2_id')::UUID)),
  current_setting('over_test.exec2_id')::UUID,
  'Test 4: ActaItemSource del Borrador #2 referencia unicamente la ejecución 2 sin duplicar ✓'
);

-- Test 5: Ajustar la cantidad del Borrador 2 a 10 m2 libera 20 m2 a su saldo
DO $$
BEGIN
  PERFORM public.adjust_acta_item_quantity(
    (SELECT id FROM public.acta_items WHERE acta_id = current_setting('over_test.acta2_id')::UUID),
    10
  );
END;
$$;

SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('over_test.exec2_id')::UUID),
  10::NUMERIC,
  'Test 5: adjust_acta_item_quantity libera 20 m2 dejando 10 m2 consumidos en la ejecución 2 ✓'
);

-- Test 6: La suma consumida total de la ejec 1 sigue siendo 80 y la ejec 2 es 10, amabas dentro de sus executed_qty
SELECT ok(
  (
    (SELECT SUM(cantidad_consumida) FROM public.acta_item_sources WHERE execution_id = current_setting('over_test.exec1_id')::UUID) <= 80
    AND
    (SELECT SUM(cantidad_consumida) FROM public.acta_item_sources WHERE execution_id = current_setting('over_test.exec2_id')::UUID) <= 30
  ),
  'Test 6: Invariante global — ninguna ejecución supera su cantidad ejecutada certificada ✓'
);

SELECT * FROM finish();
ROLLBACK;
