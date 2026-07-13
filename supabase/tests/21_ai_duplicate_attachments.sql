-- =============================================================================
-- Tests: get_duplicate_attachments() (IA)
--
-- CONTRATO: supabase/migrations/20260815_execution_attachments_file_hash.sql,
-- 20260816_ai_duplicate_attachments.sql
--
-- Cubre: mismo hash en 2 ejecuciones distintas -> ambas filas aparecen;
-- un archivo con hash único no aparece; fotos con file_hash NULL se
-- excluyen (no se puede saber si son duplicados); autorización; board sin
-- duplicados devuelve 0 filas sin error.
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

SELECT plan(7);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0022 / 5ca1ab1e...2201).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000022', 'Test Board Duplicate Attachments', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002201', 'ec0e0000-0000-0000-0000-000000000022', 'Zona Duplicados', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000022', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('ec0e0000-0000-0000-0000-000000000022', 'DA_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
  v_plan_id UUID; v_item_id UUID; v_exec_1 UUID; v_exec_2 UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('ec0e0000-0000-0000-0000-000000000022', 'POA Test Duplicates') RETURNING id INTO v_poa_id;
  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by) VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001') RETURNING id INTO v_version_id;
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario) VALUES (v_version_id, 'DA_001', 4, 1000) RETURNING id INTO v_activity_id;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada) VALUES (v_activity_id, '5ca1ab1e-0000-0000-0000-000000002201', 10000) RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by)
  VALUES ('ec0e0000-0000-0000-0000-000000000022', '5ca1ab1e-0000-0000-0000-000000002201', '2026-11-02', 1, 'in_progress', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_plan_id;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento, planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'DA_001', v_paz_id, 10, 4, 'preferred', 40, 'und', 1)
  RETURNING id INTO v_item_id;

  -- Ejecución 1: 2026-11-02.
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-11-02', 2, '2026-11-02 07:00', '2026-11-02 15:00', 40, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_1;

  -- Ejecución 2: 2026-11-09, DISTINTA jornada.
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-11-09', 2, '2026-11-09 07:00', '2026-11-09 15:00', 40, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_2;

  -- Mismo file_hash reusado entre las DOS ejecuciones -> debe aparecer.
  INSERT INTO public.execution_attachments (execution_id, file_name, file_url, file_type, uploaded_by, file_hash, created_at)
  VALUES
    (v_exec_1, 'foto_reusada.jpg', 'https://example.test/1.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001', 'hash_duplicado_abc', NOW()),
    (v_exec_2, 'foto_reusada_otra_vez.jpg', 'https://example.test/2.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001', 'hash_duplicado_abc', NOW());

  -- Archivo con hash único -> NO debe aparecer.
  INSERT INTO public.execution_attachments (execution_id, file_name, file_url, file_type, uploaded_by, file_hash, created_at)
  VALUES (v_exec_1, 'foto_unica.jpg', 'https://example.test/3.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001', 'hash_unico_xyz', NOW());

  -- Foto histórica sin hash -> NO debe aparecer (no se puede saber si es duplicada).
  INSERT INTO public.execution_attachments (execution_id, file_name, file_url, file_type, uploaded_by, file_hash, created_at)
  VALUES (v_exec_1, 'foto_historica.jpg', 'https://example.test/4.jpg', 'image/jpeg', 'aaaaaaaa-0000-0000-0000-000000000001', NULL, NOW());

  PERFORM set_config('da_test.exec_1', v_exec_1::TEXT, false);
  PERFORM set_config('da_test.exec_2', v_exec_2::TEXT, false);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000022')),
  2,
  'Test 1: 2 filas totales — solo el par duplicado, ni la foto única ni la histórica sin hash ✓'
);
SELECT is(
  (SELECT COUNT(DISTINCT execution_id)::INT FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000022')),
  2,
  'Test 2: el duplicado abarca las 2 ejecuciones distintas (reuso entre jornadas, no solo dentro de una) ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000022') WHERE file_hash = 'hash_unico_xyz'),
  0,
  'Test 3: un archivo con hash único no aparece ✓'
);
SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000022') WHERE file_name = 'foto_historica.jpg'),
  0,
  'Test 4: una foto sin file_hash (histórica) nunca aparece, aunque coincidiera por casualidad ✓'
);
SELECT is(
  (SELECT activity_name FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000022') LIMIT 1),
  'Poda de árboles',
  'Test 5: activity_name resuelto desde board_activity_standards ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000022') $$,
  '%No tiene acceso%',
  'Test 6: un no-miembro no puede leer get_duplicate_attachments() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000023', 'Test Board Duplicate Attachments Empty', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000023', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_duplicate_attachments('ec0e0000-0000-0000-0000-000000000023')),
  0,
  'Test 7: un board sin ningún duplicado devuelve 0 filas, sin error ✓'
);

SELECT * FROM finish();
ROLLBACK;
