-- =============================================================================
-- Tests: get_missing_board_activity_standards(board_id, poa_version_id)
--
-- CONTRATO: supabase/migrations/20260825_get_missing_board_activity_standards.sql
-- Separacion de fases (docs/architecture/poa-technical-catalog-decoupling.md):
-- actividades de poa_activities (fase contractual) sin fila vigente en
-- board_activity_standards (fase tecnica) para ese board.
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

SELECT plan(7);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0026 / 5ca1ab1e...26NN)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000026', 'Test Board Missing Standards', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000026', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002601', 'ec0e0000-0000-0000-0000-000000000026', 'Sitio Test Missing', '#3B7EF8', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('5ca1ab1e-0000-0000-0000-00000000260a', 'ec0e0000-0000-0000-0000-000000000026', 'POA Test Missing Standards')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa_versions (id, poa_id, version_number, status, created_by)
VALUES ('5ca1ab1e-0000-0000-0000-00000000260b', '5ca1ab1e-0000-0000-0000-00000000260a', 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 3 actividades contratadas: GMS_01 (sin catálogo técnico), GMS_02 (con
-- catálogo técnico vigente), GMS_03 (sin catálogo técnico) — import_order
-- deliberadamente fuera de orden alfabético para probar el ORDER BY.
INSERT INTO public.poa_activities (poa_version_id, activity_key, description, unit, precio_unitario, frecuencia, import_order)
VALUES
  ('5ca1ab1e-0000-0000-0000-00000000260b', 'GMS_03', 'Actividad tres', 'M3', 100, 1, 0),
  ('5ca1ab1e-0000-0000-0000-00000000260b', 'GMS_01', 'Actividad uno', 'M2', 100, 1, 1),
  ('5ca1ab1e-0000-0000-0000-00000000260b', 'GMS_02', 'Actividad dos', 'UND', 100, 1, 2)
ON CONFLICT (poa_version_id, activity_key) DO NOTHING;

-- Solo GMS_02 tiene catálogo técnico vigente para este board. `frecuencia`
-- ya NO vive en board_activity_standards (ADR-0002, DROP COLUMN en
-- 20260714_poa_domain_schema.sql) — vive en poa_activities.
INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
VALUES ('ec0e0000-0000-0000-0000-000000000026', 'GMS_02', 'Actividad dos', 'ZONA VERDE', 'UND', 500)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1-2: faltan exactamente GMS_01 y GMS_03, en orden de import_order (GMS_03 primero)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_missing_board_activity_standards(
    'ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b'
  )),
  2,
  'Test 1: exactamente 2 actividades pendientes de configuración técnica ✓'
);

SELECT is(
  (SELECT array_agg(activity_key ORDER BY ordinality) FROM (
    SELECT activity_key, row_number() OVER () AS ordinality
    FROM public.get_missing_board_activity_standards(
      'ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b'
    )
  ) t),
  ARRAY['GMS_03', 'GMS_01'],
  'Test 2: orden por import_order (GMS_03 antes que GMS_01) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: GMS_02 (con catálogo técnico vigente) NUNCA aparece como pendiente
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_missing_board_activity_standards(
    'ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b'
  ) WHERE activity_key = 'GMS_02'),
  0,
  'Test 3: GMS_02 no aparece — ya tiene catálogo técnico vigente ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: description/unit vienen de poa_activities, no de board_activity_standards
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT description FROM public.get_missing_board_activity_standards(
    'ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b'
  ) WHERE activity_key = 'GMS_01'),
  'Actividad uno',
  'Test 4: description viene de poa_activities ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: catálogo técnico completo -> lista vacía, sin error
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
VALUES
  ('ec0e0000-0000-0000-0000-000000000026', 'GMS_01', 'Actividad uno', 'ZONA VERDE', 'M2', 500),
  ('ec0e0000-0000-0000-0000-000000000026', 'GMS_03', 'Actividad tres', 'ZONA DURA', 'M3', 500)
ON CONFLICT DO NOTHING;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_missing_board_activity_standards(
    'ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b'
  )),
  0,
  'Test 5: con el catálogo técnico completo, la lista queda vacía sin error ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6-7: no-miembro bajo RLS real
-- ─────────────────────────────────────────────────────────────────────────────

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_like(
  $$ SELECT * FROM public.get_missing_board_activity_standards('ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b') $$,
  '%No tiene acceso%',
  'Test 6: un no-miembro no puede leer (chequeo propio de get_user_board_role) ✓'
);

SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_missing_board_activity_standards(
    'ec0e0000-0000-0000-0000-000000000026', '5ca1ab1e-0000-0000-0000-00000000260b'
  )),
  0,
  'Test 7: el admin del board vuelve a poder leer sin error tras restaurar el rol ✓'
);

SELECT * FROM finish();
ROLLBACK;
