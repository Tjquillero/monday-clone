-- =============================================================================
-- Tests: get_execution_attachments() (IA)
--
-- CONTRATO: supabase/migrations/20260811_ai_execution_attachments_lookup.sql,
-- 20260813_ai_execution_attachments_phase.sql (agrega columna phase)
--
-- Cubre: devuelve las fotos reales de una ejecución, orden por created_at,
-- una ejecución sin fotos devuelve 0 filas sin error, autorización, phase
-- correcto (incluye NULL para fotos sin clasificar).
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar (con el ciclo completo):
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

SELECT plan(10);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0021 / 5ca1ab1e...2101).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000021', 'Test Board Attachments Lookup', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002101', 'ec0e0000-0000-0000-0000-000000000021', 'Zona Fotos', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000021', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ec0e0000-0000-0000-0000-000000000021', 'AT_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
  v_plan_id UUID; v_item_id UUID; v_exec_with_photos UUID; v_exec_no_photos UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('ec0e0000-0000-0000-0000-000000000021', 'POA Test Attachments Lookup') RETURNING id INTO v_poa_id;
  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by) VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001') RETURNING id INTO v_version_id;
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario) VALUES (v_version_id, 'AT_001', 4, 1000) RETURNING id INTO v_activity_id;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada) VALUES (v_activity_id, '5ca1ab1e-0000-0000-0000-000000002101', 10000) RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('ec0e0000-0000-0000-0000-000000000021', '5ca1ab1e-0000-0000-0000-000000002101', '2026-11-02', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento, planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'AT_001', v_paz_id, 10, 4, 'preferred', 40, 'und', 1)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-11-02', 2, '2026-11-02 07:00', '2026-11-02 15:00', 40, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_with_photos;

  INSERT INTO public.execution_attachments (execution_id, file_name, file_url, file_type, uploaded_by, phase, created_at)
  VALUES
    (v_exec_with_photos, 'foto1.jpg', 'https://example.test/foto1.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001', 'before', NOW() - INTERVAL '2 minutes'),
    (v_exec_with_photos, 'foto2.jpg', 'https://example.test/foto2.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, NOW() - INTERVAL '1 minutes');

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-11-09', 2, '2026-11-09 07:00', '2026-11-09 15:00', 40, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_no_photos;

  PERFORM set_config('at_test.exec_with_photos', v_exec_with_photos::TEXT, false);
  PERFORM set_config('at_test.exec_no_photos', v_exec_no_photos::TEXT, false);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID)),
  2,
  'Test 1: devuelve las 2 fotos reales de la ejecución ✓'
);
SELECT is(
  (SELECT file_url FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID) ORDER BY file_name LIMIT 1),
  'https://example.test/foto1.jpg',
  'Test 2: file_url correcto ✓'
);
SELECT is(
  (SELECT file_type FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID) ORDER BY file_name LIMIT 1),
  'image/jpeg',
  'Test 3: file_type correcto ✓'
);
SELECT is(
  (SELECT array_agg(file_name) FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID)),
  ARRAY['foto1.jpg', 'foto2.jpg'],
  'Test 4: orden por created_at ascendente (ya ordenado dentro de la función) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_execution_attachments(current_setting('at_test.exec_no_photos')::UUID)),
  0,
  'Test 5: una ejecución sin fotos devuelve 0 filas, sin error ✓'
);
SELECT is(
  (SELECT phase FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID) WHERE file_name = 'foto1.jpg'),
  'before',
  'Test 6: phase = before para la foto clasificada ✓'
);
SELECT is(
  (SELECT phase FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID) WHERE file_name = 'foto2.jpg'),
  NULL,
  'Test 7: phase = NULL para la foto sin clasificar (nunca se infiere) ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_execution_attachments(current_setting('at_test.exec_with_photos')::UUID) $$,
  '%No tiene acceso%',
  'Test 8: un no-miembro no puede leer get_execution_attachments() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_like(
  $$ INSERT INTO public.execution_attachments (execution_id, file_name, file_url, phase, uploaded_by)
     VALUES (current_setting('at_test.exec_with_photos')::UUID, 'invalida.jpg', 'https://example.test/invalida.jpg', 'durante', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '%execution_attachments_phase_check%',
  'Test 9: phase solo acepta before/after — cualquier otro valor se rechaza (concepto de dominio, no texto libre) ✓'
);

-- Contrato congelado con el usuario: phase se captura al momento de subir
-- la foto, nunca se edita después como parte del flujo normal — sin
-- política RLS de UPDATE en execution_attachments (deny-by-default), así
-- que ni siquiera un admin/miembro del board puede cambiarla vía el
-- cliente normal. Se prueba bajo el rol authenticated real (no postgres),
-- porque BYPASSRLS ocultaría exactamente lo que se quiere proteger aquí.
SET LOCAL ROLE authenticated;
UPDATE public.execution_attachments
SET phase = 'after'
WHERE execution_id = current_setting('at_test.exec_with_photos')::UUID
  AND file_name = 'foto1.jpg';
SET LOCAL ROLE postgres;

SELECT is(
  (SELECT phase FROM public.execution_attachments WHERE execution_id = current_setting('at_test.exec_with_photos')::UUID AND file_name = 'foto1.jpg'),
  'before',
  'Test 10: RLS deny-by-default bloquea el UPDATE de phase — se captura al subir, no se edita después (sin política UPDATE en execution_attachments) ✓'
);

SELECT * FROM finish();
ROLLBACK;
