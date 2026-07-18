-- =============================================================================
-- Tests: get_board_operational_agenda(board_id, date)
--
-- CONTRATO: supabase/migrations/20260821_board_operational_agenda.sql
-- Resumen de solo lectura para la Agenda Operativa (vista Hoy): conteos del
-- dia, planes listos para confirmar/cerrar (mismos gates de
-- confirm_weekly_plan/close_weekly_plan) y semaforo de cumplimiento por sitio
-- de la semana vigente (lunes-viernes).
--
-- Fecha de referencia fija (p_date explicito) para que los tests no dependan
-- del reloj real: TEST_DATE = 2026-09-14 (lunes).
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar (con el ciclo completo, no un archivo suelto):
--   npm run test:db:setup && npm run test:db && npm run test:db:teardown
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(17);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0023 / 5ca1ab1e...23NN). TEST_DATE = lunes de
-- la semana vigente para las fixtures 'current week'.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000023', 'Test Board Agenda Operativa', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000023', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position) VALUES
  ('5ca1ab1e-0000-0000-0000-000000002301', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Confirmable', '#00FF00', 0),
  ('5ca1ab1e-0000-0000-0000-000000002302', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Pendiente', '#FFFF00', 1),
  ('5ca1ab1e-0000-0000-0000-000000002303', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Sin Evidencia', '#FF00FF', 2),
  ('5ca1ab1e-0000-0000-0000-000000002304', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Cerrable', '#0000FF', 3),
  ('5ca1ab1e-0000-0000-0000-000000002305', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Verde 80', '#111111', 4),
  ('5ca1ab1e-0000-0000-0000-000000002306', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Ambar 50', '#222222', 5),
  ('5ca1ab1e-0000-0000-0000-000000002307', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Rojo 25', '#333333', 6),
  ('5ca1ab1e-0000-0000-0000-000000002308', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Semana Pasada', '#444444', 7),
  ('5ca1ab1e-0000-0000-0000-000000002309', 'ec0e0000-0000-0000-0000-000000000023', 'Sitio Pendiente Historico', '#555555', 8)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_seed_plan_23(p_group_id UUID, p_week_start DATE, p_status TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_plan_id UUID;
BEGIN
  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('ec0e0000-0000-0000-0000-000000000023', p_group_id, p_week_start, 1, p_status, 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;
  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION _test_seed_item_execution_23(
  p_plan_id UUID, p_group_id UUID, p_activity_key TEXT, p_execution_date DATE, p_status TEXT,
  p_with_attachment BOOLEAN DEFAULT TRUE
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('ec0e0000-0000-0000-0000-000000000023', 'POA Test Agenda')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;
  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, 4, 1000)
  ON CONFLICT (poa_version_id, activity_key) DO NOTHING
  RETURNING id INTO v_activity_id;
  IF v_activity_id IS NULL THEN
    SELECT id INTO v_activity_id FROM public.poa_activities WHERE poa_version_id = v_version_id AND activity_key = p_activity_key;
  END IF;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_group_id, 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO NOTHING
  RETURNING id INTO v_paz_id;
  IF v_paz_id IS NULL THEN
    SELECT id INTO v_paz_id FROM public.poa_activity_zones WHERE poa_activity_id = v_activity_id AND zone_id = p_group_id;
  END IF;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (p_plan_id, (SELECT COALESCE(MAX(planned_sequence), 0) + 1 FROM public.weekly_plan_items WHERE plan_id = p_plan_id),
          p_activity_key, v_paz_id, 10, 4, 'preferred', 10, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status,
     verified_by, verified_at, rejection_notes, created_by)
  VALUES (
    v_item_id, p_execution_date,
    2, (p_execution_date::TEXT || ' 07:00:00')::TIMESTAMPTZ, (p_execution_date::TEXT || ' 15:00:00')::TIMESTAMPTZ,
    10, p_status,
    CASE WHEN p_status = 'verified' THEN 'aaaaaaaa-0000-0000-0000-000000000001'::UUID END,
    CASE WHEN p_status = 'verified' THEN NOW() END,
    CASE WHEN p_status = 'rejected' THEN 'Motivo de prueba' END,
    'aaaaaaaa-0000-0000-0000-000000000001'
  )
  RETURNING id INTO v_exec_id;

  IF p_with_attachment THEN
    INSERT INTO public.execution_attachments (execution_id, file_name, file_url, file_type, uploaded_by)
    VALUES (v_exec_id, 'foto.jpg', 'https://example.test/foto.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001');
  END IF;

  RETURN v_exec_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures: TEST_DATE = 2026-09-14 (lunes). "Ayer" y "hace 10 dias" no cuentan
-- para los conteos de HOY pero si para pending_verification_count (sin
-- filtro de fecha, igual que la bandeja de Verificacion).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_p1 UUID; v_p2 UUID; v_p3 UUID; v_p4 UUID; v_p5 UUID; v_p6 UUID; v_p7 UUID; v_p8 UUID; v_p9 UUID;
BEGIN
  -- G1: en curso, 1 verified HOY con evidencia -> listo para confirmar, cuenta hoy.
  v_p1 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002301', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p1, '5ca1ab1e-0000-0000-0000-000000002301', 'AG_ACT_01', '2026-09-14', 'verified');

  -- G2: en curso, 1 reported HOY -> excluye de listo-para-confirmar (Gate 1), cuenta hoy y pendiente.
  v_p2 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002302', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p2, '5ca1ab1e-0000-0000-0000-000000002302', 'AG_ACT_02', '2026-09-14', 'reported');

  -- G3: en curso, 1 verified HOY SIN evidencia -> excluye de listo-para-confirmar (Gate 2), missing_evidence.
  v_p3 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002303', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p3, '5ca1ab1e-0000-0000-0000-000000002303', 'AG_ACT_03', '2026-09-14', 'verified', FALSE);

  -- G4: confirmed -> listo para cerrar. Ejecucion de ayer (no debe afectar conteos de hoy).
  v_p4 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002304', '2026-09-14', 'confirmed');
  PERFORM _test_seed_item_execution_23(v_p4, '5ca1ab1e-0000-0000-0000-000000002304', 'AG_ACT_04', '2026-09-13', 'verified');

  -- G5: semana vigente, 4 verified + 1 rejected = 80% -> borde exacto de verde.
  v_p5 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002305', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p5, '5ca1ab1e-0000-0000-0000-000000002305', 'AG_ACT_05A', '2026-09-13', 'verified');
  PERFORM _test_seed_item_execution_23(v_p5, '5ca1ab1e-0000-0000-0000-000000002305', 'AG_ACT_05B', '2026-09-13', 'verified');
  PERFORM _test_seed_item_execution_23(v_p5, '5ca1ab1e-0000-0000-0000-000000002305', 'AG_ACT_05C', '2026-09-13', 'verified');
  PERFORM _test_seed_item_execution_23(v_p5, '5ca1ab1e-0000-0000-0000-000000002305', 'AG_ACT_05D', '2026-09-13', 'verified');
  PERFORM _test_seed_item_execution_23(v_p5, '5ca1ab1e-0000-0000-0000-000000002305', 'AG_ACT_05E', '2026-09-13', 'rejected');

  -- G6: semana vigente, 1 verified + 1 rejected = 50% -> borde exacto de ambar.
  v_p6 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002306', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p6, '5ca1ab1e-0000-0000-0000-000000002306', 'AG_ACT_06A', '2026-09-13', 'verified');
  PERFORM _test_seed_item_execution_23(v_p6, '5ca1ab1e-0000-0000-0000-000000002306', 'AG_ACT_06B', '2026-09-13', 'rejected');

  -- G7: semana vigente, 1 verified + 3 rejected = 25% -> rojo.
  v_p7 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002307', '2026-09-14', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p7, '5ca1ab1e-0000-0000-0000-000000002307', 'AG_ACT_07A', '2026-09-13', 'verified');
  PERFORM _test_seed_item_execution_23(v_p7, '5ca1ab1e-0000-0000-0000-000000002307', 'AG_ACT_07B', '2026-09-13', 'rejected');
  PERFORM _test_seed_item_execution_23(v_p7, '5ca1ab1e-0000-0000-0000-000000002307', 'AG_ACT_07C', '2026-09-13', 'rejected');
  PERFORM _test_seed_item_execution_23(v_p7, '5ca1ab1e-0000-0000-0000-000000002307', 'AG_ACT_07D', '2026-09-13', 'rejected');

  -- G8: semana PASADA (week_start = TEST_DATE - 7) -> NO debe aparecer en el semaforo, aunque este 100% verificado.
  v_p8 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002308', '2026-09-07', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p8, '5ca1ab1e-0000-0000-0000-000000002308', 'AG_ACT_08', '2026-09-07', 'verified');

  -- G9: reported hace 10 dias -> pending_verification_count lo cuenta (sin filtro de fecha),
  -- reported_today_count NO lo cuenta (no es de hoy).
  v_p9 := _test_seed_plan_23('5ca1ab1e-0000-0000-0000-000000002309', '2026-08-31', 'in_progress');
  PERFORM _test_seed_item_execution_23(v_p9, '5ca1ab1e-0000-0000-0000-000000002309', 'AG_ACT_09', '2026-09-04', 'reported');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Conteos de HOY (2026-09-14)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT reported_today_count FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14')),
  3,
  'Test 1: reported_today_count = 3 (G1 verified + G2 reported + G3 verified, todas de hoy) ✓'
);
SELECT is(
  (SELECT verified_today_count FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14')),
  2,
  'Test 2: verified_today_count = 2 (G1 + G3, no G2 que es reported) ✓'
);
SELECT is(
  (SELECT pending_verification_count FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14')),
  2,
  'Test 3: pending_verification_count = 2 (G2 de hoy + G9 de hace 10 dias — sin filtro de fecha) ✓'
);
SELECT is(
  (SELECT missing_evidence_count FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14')),
  1,
  'Test 4: missing_evidence_count = 1 (solo G3, todas las demas verified tienen evidencia) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Listas para confirmar / cerrar (busqueda por group_title, no por indice)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT ready_to_confirm FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Confirmable'),
  1,
  'Test 5: ready_to_confirm incluye Sitio Confirmable (0 pendientes, 0 sin evidencia) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT ready_to_confirm FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Pendiente'),
  0,
  'Test 6: ready_to_confirm excluye Sitio Pendiente (Gate 1: tiene una reported) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT ready_to_confirm FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Sin Evidencia'),
  0,
  'Test 7: ready_to_confirm excluye Sitio Sin Evidencia (Gate 2: verified sin foto) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT ready_to_close FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Cerrable'),
  1,
  'Test 8: ready_to_close incluye Sitio Cerrable (status=confirmed) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT ready_to_close FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Pendiente'),
  0,
  'Test 9: ready_to_close excluye Sitio Pendiente (in_progress, no confirmed) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Semaforo (busqueda por group_title, umbrales exactos)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT elem->>'semaphore' FROM jsonb_array_elements(
     (SELECT site_semaphore FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Verde 80'),
  'green',
  'Test 10: 80% verificado -> verde (borde exacto, >=80) ✓'
);
SELECT is(
  (SELECT elem->>'semaphore' FROM jsonb_array_elements(
     (SELECT site_semaphore FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Ambar 50'),
  'amber',
  'Test 11: 50% verificado -> ambar (borde exacto, >=50) ✓'
);
SELECT is(
  (SELECT elem->>'semaphore' FROM jsonb_array_elements(
     (SELECT site_semaphore FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Rojo 25'),
  'red',
  'Test 12: 25% verificado -> rojo ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM jsonb_array_elements(
     (SELECT site_semaphore FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14'))
   ) elem WHERE elem->>'group_title' = 'Sitio Semana Pasada'),
  0,
  'Test 13: Sitio Semana Pasada NO aparece en el semaforo (fuera de la semana vigente) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Board sin datos
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000024', 'Test Board Agenda Vacio', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000024', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT reported_today_count FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000024', '2026-09-14')),
  0,
  'Test 14: board sin datos — reported_today_count = 0 ✓'
);
SELECT is(
  (SELECT missing_evidence_count FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000024', '2026-09-14')),
  0,
  'Test 15: board sin datos — missing_evidence_count = 0 ✓'
);
SELECT is(
  (SELECT ready_to_confirm FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000024', '2026-09-14')),
  '[]'::jsonb,
  'Test 16: board sin datos — ready_to_confirm = [] (sin error, sin NULL) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 17: un no-miembro no puede leer (get_executions_without_evidence,
-- invocada internamente, ya exige autorizacion propia) — RLS real bajo
-- authenticated (postgres tiene BYPASSRLS, ver 22_weekly_plan_confirmation_summary.sql).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_like(
  $$ SELECT * FROM public.get_board_operational_agenda('ec0e0000-0000-0000-0000-000000000023', '2026-09-14') $$,
  '%No tiene acceso%',
  'Test 17: un no-miembro no puede leer (via el chequeo de get_executions_without_evidence) ✓'
);

SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
