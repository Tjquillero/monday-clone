-- =============================================================================
-- Tests: idempotencia de comandos de dominio (report_execution + command_id)
--
-- CONTRATO: docs/architecture/offline-certification-design.md, sección
-- "Idempotencia". Este archivo es su especificación ejecutable.
--
-- Contrato verificado:
--   - report_execution(execution_id, command_id) sin command_id se comporta
--     exactamente igual que antes (retrocompatible).
--   - Repetir la MISMA llamada con el MISMO command_id no relanza el efecto:
--     la segunda vez es un no-op silencioso (no excepción), aunque el estado
--     ya no sea 'draft' (que normalmente dispararía el error semántico).
--   - Un command_id NUEVO sobre una ejecución ya reportada sí falla con el
--     error semántico real ("Solo se puede reportar... draft") — la
--     idempotencia protege reintentos del MISMO comando, no vuelve la
--     operación repetible en general.
--   - Cada command_id exitoso queda registrado en processed_domain_commands
--     exactamente una vez.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql /
-- 02_evidence_gate.sql): corrompe el contador interno de pgTAP.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/03_command_idempotency.sql
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures — prefijo gggg/hhhh, propio de este archivo.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('11111111-0000-0000-0000-000000000001', 'Test Board Idempotency', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sitio Idempotency', '#00FF00', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'leader')
ON CONFLICT (board_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_set_user(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user_id)::TEXT, true);
$$;

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_zone(
  p_board_id UUID, p_zone_id UUID, p_activity_key TEXT, p_frecuencia NUMERIC,
  p_precio_unitario NUMERIC DEFAULT 100000, p_cantidad_contratada NUMERIC DEFAULT 100000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_zone_row_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, p_frecuencia, p_precio_unitario)
  ON CONFLICT (poa_version_id, activity_key) DO UPDATE SET frecuencia = EXCLUDED.frecuencia
  RETURNING id INTO v_activity_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_zone_id, p_cantidad_contratada)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada
  RETURNING id INTO v_zone_row_id;

  RETURN v_zone_row_id;
END;
$$;

-- Helper: plan 'published' + 1 item + 1 execution 'draft', propios del líder.
CREATE OR REPLACE FUNCTION _test_seed_draft_execution(
  p_week_start DATE, p_activity_key TEXT,
  OUT o_plan_id UUID, OUT o_execution_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
  v_paz_id UUID; v_item_id UUID;
  v_started TIMESTAMPTZ := (p_week_start::TEXT || ' 07:00:00')::TIMESTAMPTZ;
  v_finished TIMESTAMPTZ := (p_week_start::TEXT || ' 15:00:00')::TIMESTAMPTZ;
BEGIN
  v_paz_id := _test_seed_poa_activity_zone(
    '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', p_activity_key, 4
  );

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
          p_week_start, 1, 'published', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO o_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (o_plan_id, 1, p_activity_key, v_paz_id, 10, 4, 'preferred', 100, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (v_item_id, p_week_start, 2, v_started, v_finished, 50, 'draft', 'aaaaaaaa-0000-0000-0000-000000000003')
  RETURNING id INTO o_execution_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: sin command_id, comportamiento retrocompatible (draft → reported)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_draft_execution('2026-09-14', 'IDEMP_ACT_001');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000003'); -- leader, creador
  PERFORM public.report_execution(v_exec_id); -- sin p_command_id
END;
$$;

SELECT is(
  (SELECT status FROM public.weekly_plan_item_executions
   WHERE plan_item_id = (SELECT id FROM public.weekly_plan_items WHERE activity_key = 'IDEMP_ACT_001')),
  'reported',
  'Test 1: report_execution sin command_id sigue funcionando igual que antes ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2 y 3: mismo command_id repetido → no-op silencioso, no excepción
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_plan_id UUID; v_exec_id UUID; v_cmd_id UUID := gen_random_uuid();
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_draft_execution('2026-09-21', 'IDEMP_ACT_002');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000003');
  PERFORM public.report_execution(v_exec_id, v_cmd_id); -- primer intento: éxito real

  -- Reintento con el MISMO command_id — simula el reintento de
  -- useOfflineSync tras un corte de red antes de recibir la confirmación.
  -- No debe lanzar excepción aunque la ejecución ya no esté en 'draft'.
  PERFORM public.report_execution(v_exec_id, v_cmd_id);

  -- Registrar el execution_id/command_id para las siguientes dos aserciones
  PERFORM set_config('test.idemp_exec_id', v_exec_id::TEXT, false);
  PERFORM set_config('test.idemp_cmd_id', v_cmd_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT status::TEXT FROM public.weekly_plan_item_executions WHERE id = current_setting('test.idemp_exec_id')::UUID),
  'reported',
  'Test 2: reintento con el mismo command_id no rompe el estado (sigue reported, no error) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.processed_domain_commands WHERE command_id = current_setting('test.idemp_cmd_id')::UUID),
  1,
  'Test 3: el command_id queda registrado UNA sola vez, no duplicado por el reintento ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: command_id DIFERENTE sobre una ejecución ya reportada → sí falla
-- (la idempotencia no vuelve la operación repetible en general)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_plan_id UUID; v_exec_id UUID;
  v_cmd_id_1 UUID := gen_random_uuid();
  v_cmd_id_2 UUID := gen_random_uuid();
  v_ok BOOLEAN := FALSE; v_msg TEXT;
BEGIN
  SELECT o_plan_id, o_execution_id INTO v_plan_id, v_exec_id
  FROM _test_seed_draft_execution('2026-09-28', 'IDEMP_ACT_003');

  PERFORM _test_set_user('aaaaaaaa-0000-0000-0000-000000000003');
  PERFORM public.report_execution(v_exec_id, v_cmd_id_1); -- éxito real

  BEGIN
    PERFORM public.report_execution(v_exec_id, v_cmd_id_2); -- command_id nuevo, ejecución ya no es draft
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg LIKE '%draft%';
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 4: un command_id nuevo sobre una ejecución ya reportada debió fallar con el error semántico real; msg=%', v_msg;
  END IF;
END;
$$;

SELECT pass('Test 4: un command_id nuevo (no un reintento) sí dispara el error semántico real — la idempotencia no oculta conflictos genuinos ✓');

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: RLS deny-by-default en processed_domain_commands (nunca se toca
-- directamente desde el cliente, solo vía SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.processed_domain_commands'::regclass),
  TRUE,
  'Test 5: processed_domain_commands tiene RLS habilitado (deny-by-default, sin políticas) ✓'
);

SELECT * FROM finish();
ROLLBACK;
