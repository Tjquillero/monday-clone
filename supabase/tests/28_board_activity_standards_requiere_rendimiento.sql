-- =============================================================================
-- Tests: board_activity_standards.requiere_rendimiento
--
-- CONTRATO: supabase/migrations/20260828_board_activity_standards_requiere_rendimiento.sql
-- Decision 4 (docs/architecture/poa-technical-catalog-decoupling.md): distingue
-- "no aplica rendimiento" (decision deliberada) de "falta configurar"
-- (ausencia de fila, sin cambios). Ver tambien 25_get_missing_board_activity_
-- standards.sql — este archivo no repite esos casos, solo agrega el nuevo.
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

SELECT plan(6);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0028 / 5ca1ab1e...28NN)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000028', 'Test Board Requiere Rendimiento', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000028', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('5ca1ab1e-0000-0000-0000-00000000280a', 'ec0e0000-0000-0000-0000-000000000028', 'POA Test Requiere Rendimiento')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa_versions (id, poa_id, version_number, status, created_by)
VALUES ('5ca1ab1e-0000-0000-0000-00000000280b', '5ca1ab1e-0000-0000-0000-00000000280a', 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa_activities (poa_version_id, activity_key, description, unit, precio_unitario, frecuencia, import_order)
VALUES ('5ca1ab1e-0000-0000-0000-00000000280b', 'RR_01', 'Atencion de incidencia reactiva', 'EVENTO', 100, 1, 0)
ON CONFLICT (poa_version_id, activity_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: requiere_rendimiento=true (control) sigue funcionando igual que antes
-- ─────────────────────────────────────────────────────────────────────────────

SELECT lives_ok(
  $$ INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento, requiere_rendimiento)
     VALUES ('ec0e0000-0000-0000-0000-000000000028', 'RR_CONTROL', 'Actividad control', 'ZONA VERDE', 'M2', 500, true) $$,
  'Test 1: requiere_rendimiento=true con rendimiento>0 se inserta sin error ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: requiere_rendimiento=false con rendimiento NULL se inserta sin error
-- ─────────────────────────────────────────────────────────────────────────────

SELECT lives_ok(
  $$ INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento, requiere_rendimiento)
     VALUES ('ec0e0000-0000-0000-0000-000000000028', 'RR_01', 'Atencion de incidencia reactiva', 'ZONA DURA', 'EVENTO', NULL, false) $$,
  'Test 2: requiere_rendimiento=false con rendimiento NULL se inserta sin error ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3-4: el CHECK cruzado rechaza combinaciones invalidas
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_ok(
  $$ INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento, requiere_rendimiento)
     VALUES ('ec0e0000-0000-0000-0000-000000000028', 'RR_INVALIDO_1', 'Sin rendimiento pero requerido', 'ZONA VERDE', 'M2', NULL, true) $$,
  '23514',
  'Test 3: requiere_rendimiento=true con rendimiento NULL viola el CHECK ✓'
);

SELECT throws_ok(
  $$ INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento, requiere_rendimiento)
     VALUES ('ec0e0000-0000-0000-0000-000000000028', 'RR_INVALIDO_2', 'Con rendimiento pero no aplica', 'ZONA VERDE', 'M2', 500, false) $$,
  '23514',
  'Test 4: requiere_rendimiento=false con rendimiento NOT NULL viola el CHECK ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: omitir la columna (INSERT al estilo anterior) sigue funcionando —
-- default true, sin necesidad de backfill para codigo/datos ya existentes.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT lives_ok(
  $$ INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
     VALUES ('ec0e0000-0000-0000-0000-000000000028', 'RR_LEGACY_INSERT', 'Insert al estilo anterior', 'ZONA VERDE', 'M2', 300) $$,
  'Test 5: INSERT sin mencionar requiere_rendimiento sigue funcionando (default true) ✓'
);

SELECT is(
  (SELECT requiere_rendimiento FROM public.board_activity_standards
   WHERE board_id = 'ec0e0000-0000-0000-0000-000000000028' AND activity_key = 'RR_LEGACY_INSERT' AND effective_to IS NULL),
  true,
  'Test 5b: ese INSERT quedo con requiere_rendimiento=true por default ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: get_missing_board_activity_standards ya no lista RR_01 — una fila
-- con requiere_rendimiento=false cuenta como "ya decidido", igual que una
-- fila configurada con rendimiento (NOT EXISTS sigue siendo el unico criterio,
-- sin cambios de codigo en la funcion).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_missing_board_activity_standards(
    'ec0e0000-0000-0000-0000-000000000028', '5ca1ab1e-0000-0000-0000-00000000280b'
  ) WHERE activity_key = 'RR_01'),
  0,
  'Test 6: RR_01 (requiere_rendimiento=false) no aparece como pendiente ✓'
);

SELECT * FROM finish();
ROLLBACK;
