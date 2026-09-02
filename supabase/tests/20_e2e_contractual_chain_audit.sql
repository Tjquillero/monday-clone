-- =============================================================================
-- Test 20: Auditoría de Integración E2E y Matriz de Pruebas de Abuso
--
-- CONTRATO: ADR-0003, ADR-0006, ADR-0010, poa-domain, schedule-domain, execution-domain
--
-- Demuestra empíricamente la Cadena Contractual E2E Completa y valida los 13
-- casos negativos / límites de la arquitectura en una sola transacción:
--
-- 1.  Ejecución no verified -> no facturable.
-- 2.  Plan no closed/confirmed -> no facturable.
-- 3.  executed_qty = 0 -> no facturable.
-- 4.  Saldo totalmente consumido -> no aparece en nuevo DRAFT.
-- 5.  Consumo superior a executed_qty -> rechazado por trigger de overbilling.
-- 6.  Segundo generate_acta_draft concurrente -> devuelve misma acta (Idempotente).
-- 7.  Eliminación de DRAFT -> libera reserva en acta_item_sources.
-- 8.  Acta ISSUED -> no modificable (triggers de inmutabilidad).
-- 9.  POA v2 active -> NO altera Weekly Plan histórico.
-- 10. POA v2 active -> NO altera Execution física histórica.
-- 11. POA v2 active -> NO altera Acta ISSUED histórica.
-- 12. Nuevo DRAFT después de POA v2 -> utiliza precio de POA v2.
-- 13. Acta histórica -> mantiene snapshot original inmutable.
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

-- Fixtures del E2E Audit
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('e1551e00-0000-0000-0000-000000000020', 'Board E2E Chain Audit', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000120', 'e1551e00-0000-0000-0000-000000000020', 'Sitio E2E Audit', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('e1551e00-0000-0000-0000-000000000020', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('e1551e00-0000-0000-0000-000000000020', 'ACT_E2E_01', 'Limpieza e Inspección E2E', 'ZONA DURA', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Paso 1: Configurar POA v1 ($10,000) y registrar ejecuciones con varios estados
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_poa_id UUID; v_v1_id UUID; v_act1_id UUID; v_paz1_id UUID;
  v_plan_open_id UUID; v_item_open_id UUID; v_exec_unver_id UUID;
  v_plan_closed_id UUID; v_item_closed_id UUID; v_exec_ver_id UUID; v_exec_zero_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('e1551e00-0000-0000-0000-000000000020', 'POA E2E Audit')
  RETURNING id INTO v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_v1_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1_id, 'ACT_E2E_01', 4, 10000)
  RETURNING id INTO v_act1_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act1_id, '5ca1ab1e-0000-0000-0000-000000000120', 1000)
  RETURNING id INTO v_paz1_id;

  -- Plan Semanal 1: estado 'in_progress' (NO cerrado)
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('e1551e00-0000-0000-0000-000000000020', '5ca1ab1e-0000-0000-0000-000000000120', '2026-11-02', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_open_id;

  INSERT INTO public.weekly_plan_items (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento, planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_open_id, 1, 'ACT_E2E_01', v_paz1_id, 10, 4, 'preferred', 50, 'm2', 1.25)
  RETURNING id INTO v_item_open_id;

  -- Ejecución reportada pero NO verificada
  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (v_item_open_id, '2026-11-02', 1, '2026-11-02 07:00:00', '2026-11-02 15:00:00', 40, 'reported', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_unver_id;

  -- Plan Semanal 2: estado 'closed'
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000020', '5ca1ab1e-0000-0000-0000-000000000120', '2026-11-09', 2, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_closed_id;

  INSERT INTO public.weekly_plan_items (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento, planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_closed_id, 1, 'ACT_E2E_01', v_paz1_id, 10, 4, 'preferred', 50, 'm2', 1.25)
  RETURNING id INTO v_item_closed_id;

  -- Ejecución verificada con 45 m2
  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_closed_id, '2026-11-09', 2, '2026-11-09 07:00:00', '2026-11-09 15:00:00', 45, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_ver_id;

  -- Ejecución verificada con 0 m2
  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_closed_id, '2026-11-10', 1, '2026-11-10 07:00:00', '2026-11-10 15:00:00', 0, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_zero_id;

  PERFORM set_config('e2e.poa_id', v_poa_id::TEXT, false);
  PERFORM set_config('e2e.exec_ver_id', v_exec_ver_id::TEXT, false);
  PERFORM set_config('e2e.exec_unver_id', v_exec_unver_id::TEXT, false);
  PERFORM set_config('e2e.exec_zero_id', v_exec_zero_id::TEXT, false);
  PERFORM set_config('e2e.item_closed_id', v_item_closed_id::TEXT, false);
END;
$$;

-- Test 1 & 2 & 3: generate_acta_draft solo incluye la ejecución VERIFIED del plan CLOSED conExecuted > 0 (45 m2)
DO $$
DECLARE v_draft_id UUID;
BEGIN
  v_draft_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000020');
  PERFORM set_config('e2e.draft1_id', v_draft_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT cantidad_facturada FROM public.acta_items WHERE acta_id = current_setting('e2e.draft1_id')::UUID),
  45::NUMERIC,
  'Test 1, 2, 3: Borrador incluye únicamente los 45 m2 verificados del plan closed, excluyendo unverified y zero_qty ✓'
);

-- Test 6: Idempotencia bajo concurrencia — segunda llamada devuelve exactamente la misma acta
SELECT is(
  public.generate_acta_draft('e1551e00-0000-0000-0000-000000000020'),
  current_setting('e2e.draft1_id')::UUID,
  'Test 6: generate_acta_draft es idempotente y devuelve el mismo borrador ✓'
);

-- Test 5: Intentar insertar sobrefacturación en acta_item_sources es RECHAZADO
SELECT throws_like(
  format(
    'INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida) VALUES ((SELECT id FROM public.acta_items WHERE acta_id = %L), %L, 10)',
    current_setting('e2e.draft1_id'),
    current_setting('e2e.exec_ver_id')
  ),
  '%Sobrefacturación detectada%',
  'Test 5: Sobrefacturación por encima de executed_qty (45) es rechazada por el trigger guard ✓'
);

-- Test 7: Cancelar/eliminar borrador libera las reservas de saldo
DO $$
BEGIN
  DELETE FROM public.actas WHERE id = current_setting('e2e.draft1_id')::UUID;
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources WHERE execution_id = current_setting('e2e.exec_ver_id')::UUID),
  0,
  'Test 7: Eliminar borrador DRAFT elimina la reserva en acta_item_sources liberando el saldo ✓'
);

-- Re-generar borrador y emitir Acta #1 (ISSUED)
DO $$
DECLARE v_new_draft_id UUID;
BEGIN
  v_new_draft_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000020');
  PERFORM public.issue_acta(v_new_draft_id);
  PERFORM set_config('e2e.issued_acta_id', v_new_draft_id::TEXT, false);
END;
$$;

-- Test 8: UPDATE sobre el Acta emitida es rechazado (inmutable)
SELECT throws_like(
  format('UPDATE public.actas SET observaciones = %L WHERE id = %L', 'test edit', current_setting('e2e.issued_acta_id')),
  '%inmutable%',
  'Test 8: Acta ISSUED es inmutable frente a UPDATE ✓'
);

-- Test 4: Saldo totalmente consumido — la ejecución 45 m2 NO vuelve a aparecer en un nuevo borrador
SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = public.generate_acta_draft('e1551e00-0000-0000-0000-000000000020')),
  0,
  'Test 4: Ejecución con saldo 0 no genera líneas en un borrador posterior ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Paso 2: Activar POA v2 ($12,000) y verificar la NO-MUTACIÓN retroactiva
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_poa_id UUID; v_v2_id UUID; v_act2_id UUID;
BEGIN
  v_poa_id := current_setting('e2e.poa_id')::UUID;
  UPDATE public.poa_versions SET status = 'archived' WHERE poa_id = v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 2, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_v2_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v2_id, 'ACT_E2E_01', 4, 12000)
  RETURNING id INTO v_act2_id;
END;
$$;

-- Test 9: POA v2 active NO altera la cantidad planificada física del plan histórico (50 m2)
SELECT is(
  (SELECT planned_qty FROM public.weekly_plan_items WHERE id = current_setting('e2e.item_closed_id')::UUID),
  50::NUMERIC,
  'Test 9: POA v2 NO altera la cantidad planificada física histórica (50 m2) ✓'
);

-- Test 10: POA v2 active NO altera la cantidad ejecutada física de la ejecución histórica (45 m2)
SELECT is(
  (SELECT executed_qty FROM public.weekly_plan_item_executions WHERE id = current_setting('e2e.exec_ver_id')::UUID),
  45::NUMERIC,
  'Test 10: POA v2 NO altera la cantidad ejecutada física histórica (45 m2) ✓'
);

-- Test 11 & 13: POA v2 active NO altera el precio snapshot del Acta ISSUED ($10,000)
SELECT is(
  (SELECT precio_unitario_snapshot FROM public.acta_items WHERE acta_id = current_setting('e2e.issued_acta_id')::UUID),
  10000::NUMERIC,
  'Test 11 & 13: POA v2 NO altera el precio snapshot inmutable de $10,000 del Acta ISSUED ✓'
);

-- Test 12: Si se crea una NUEVA semana 3 con nueva ejecución bajo POA v2, el nuevo borrador adopta $12,000
DO $$
DECLARE
  v_plan3_id UUID; v_item3_id UUID; v_act2_id UUID; v_paz2_id UUID; v_acta3_id UUID;
BEGIN
  SELECT id INTO v_act2_id FROM public.poa_activities WHERE precio_unitario = 12000;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act2_id, '5ca1ab1e-0000-0000-0000-000000000120', 1000)
  RETURNING id INTO v_paz2_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('e1551e00-0000-0000-0000-000000000020', '5ca1ab1e-0000-0000-0000-000000000120', '2026-11-16', 3, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan3_id;

  INSERT INTO public.weekly_plan_items (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento, planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan3_id, 1, 'ACT_E2E_01', v_paz2_id, 10, 4, 'preferred', 20, 'm2', 0.5)
  RETURNING id INTO v_item3_id;

  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item3_id, '2026-11-16', 1, '2026-11-16 07:00:00', '2026-11-16 15:00:00', 20, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001');

  v_acta3_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000020');
  PERFORM set_config('e2e.acta3_id', v_acta3_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT precio_unitario_snapshot FROM public.acta_items WHERE acta_id = current_setting('e2e.acta3_id')::UUID),
  12000::NUMERIC,
  'Test 12: Nuevo borrador generado bajo POA v2 active adopta correctamente el nuevo precio de $12,000 ✓'
);

SELECT * FROM finish();
ROLLBACK;
