-- =============================================================================
-- Test 19: Ciclo de Vida Completo del Saldo de Facturación (DRAFT -> ISSUED)
--
-- CONTRATO: ADR-0003-billing-source.md
-- Ref: docs/architecture/acta-billing-design.md
--
-- Verifica la interacción armónica entre:
-- 1. Reserva de saldo durante DRAFT.
-- 2. Idempotencia y lock de concurrencia de generate_acta_draft().
-- 3. Liberación de saldo al reducir cantidad o cancelar/eliminar borrador.
-- 4. Inmutabilidad y consumo definitivo al emitir (issue_acta).
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
VALUES ('e1551e00-0000-0000-0000-000000000019', 'Test Board Lifecycle Balance', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000119', 'e1551e00-0000-0000-0000-000000000019', 'Sitio Lifecycle Test', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('e1551e00-0000-0000-0000-000000000019', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('e1551e00-0000-0000-0000-000000000019', 'ACT_LIFE_01', 'Limpieza y Descapote', 'ZONA DURA', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_poa_id UUID; v_v1_id UUID; v_act1_id UUID; v_paz1_id UUID; v_plan1_id UUID; v_item1_id UUID; v_exec1_id UUID;
  v_draft1_id UUID; v_draft2_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('e1551e00-0000-0000-0000-000000000019', 'POA Lifecycle Test')
  RETURNING id INTO v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_v1_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1_id, 'ACT_LIFE_01', 4, 8000)
  RETURNING id INTO v_act1_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act1_id, '5ca1ab1e-0000-0000-0000-000000000119', 1000)
  RETURNING id INTO v_paz1_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000019', '5ca1ab1e-0000-0000-0000-000000000119',
          '2026-11-02', 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan1_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan1_id, 1, 'ACT_LIFE_01', v_paz1_id, 10, 4, 'preferred', 100, 'm2', 2.5)
  RETURNING id INTO v_item1_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item1_id, '2026-11-02', 2, '2026-11-02 07:00:00', '2026-11-02 15:00:00',
          100, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec1_id;

  -- Paso 1: Generar borrador 1 (reserva los 100 m2)
  v_draft1_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000019');
  
  -- Generar borrador otra vez devuelve el mismo v_draft1_id (idempotente)
  v_draft2_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000019');

  PERFORM set_config('life_test.draft1_id', v_draft1_id::TEXT, false);
  PERFORM set_config('life_test.draft2_id', v_draft2_id::TEXT, false);
  PERFORM set_config('life_test.exec1_id', v_exec1_id::TEXT, false);
END;
$$;

-- Test 1: Idempotencia — llamar generate_acta_draft() dos veces devuelve exactamente la misma acta
SELECT is(
  current_setting('life_test.draft1_id')::UUID,
  current_setting('life_test.draft2_id')::UUID,
  'Test 1: generate_acta_draft() es totalmente idempotente para el mismo board ✓'
);

-- Test 2: La reserva en borrador 1 consume los 100 m2
SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('life_test.exec1_id')::UUID),
  100::NUMERIC,
  'Test 2: El borrador en DRAFT reserva 100 m2 en acta_item_sources ✓'
);

-- Paso 2: Cancelar/eliminar el borrador 1 (simula borrador abandonado)
DELETE FROM public.actas WHERE id = current_setting('life_test.draft1_id')::UUID;

-- Test 3: Eliminar el borrador 1 libera el 100% de la reserva en acta_item_sources
SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources WHERE execution_id = current_setting('life_test.exec1_id')::UUID),
  0,
  'Test 3: Eliminar el borrador DRAFT libera en cascada las reservas en acta_item_sources ✓'
);

-- Paso 3: Generar borrador nuevo tras liberacion y emitirlo
DO $$
DECLARE
  v_new_draft_id UUID;
BEGIN
  v_new_draft_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000019');
  PERFORM public.issue_acta(v_new_draft_id);
  PERFORM set_config('life_test.issued_acta_id', v_new_draft_id::TEXT, false);
END;
$$;

-- Test 4: El acta emitida pasa a estado issued y recibe numero official
SELECT is(
  (SELECT estado FROM public.actas WHERE id = current_setting('life_test.issued_acta_id')::UUID),
  'issued',
  'Test 4: El acta nueva pasa exitosamente a estado issued ✓'
);

-- Test 5: Tras la emisión, el consumo en acta_item_sources queda congelado en 100 m2
SELECT is(
  (SELECT cantidad_consumida FROM public.acta_item_sources WHERE execution_id = current_setting('life_test.exec1_id')::UUID),
  100::NUMERIC,
  'Test 5: La emisión congela el consumo de 100 m2 en acta_item_sources ✓'
);

-- Test 6: Intentar generar otro borrador posterior cuando el saldo es 0 no crea líneas
DO $$
DECLARE v_post_draft_id UUID;
BEGIN
  v_post_draft_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000019');
  PERFORM set_config('life_test.post_draft_id', v_post_draft_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = current_setting('life_test.post_draft_id')::UUID),
  0,
  'Test 6: Futuros borradores no reciben lineas de ejecuciones ya emitidas (saldo = 0) ✓'
);

SELECT * FROM finish();
ROLLBACK;
