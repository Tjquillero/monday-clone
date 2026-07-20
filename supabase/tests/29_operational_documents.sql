-- =============================================================================
-- Tests: operational_documents / document_types / mark_operational_document_vigente
--
-- CONTRATO: supabase/migrations/20260830_operational_documents.sql
-- Fase 1 de la Biblioteca de Documentos (docs/operacion/README.md) — almacenar
-- y versionar, con un vigente por (board, tipo), append-only.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar (con el ciclo completo, no un archivo suelto):
--   npm run test:db:setup && npm run test:db && npm run test:db:teardown
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

CREATE OR REPLACE FUNCTION _test_set_user_29(p_user_id UUID) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::TEXT, true);
END;
$$ LANGUAGE plpgsql;

SELECT _test_set_user_29('aaaaaaaa-0000-0000-0000-000000000001'); -- admin

BEGIN;

SELECT plan(7);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ec0e0000...0029)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000029', 'Test Board Documentos', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('ec0e0000-0000-0000-0000-000000000029', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('ec0e0000-0000-0000-0000-000000000029', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant')
ON CONFLICT (board_id, user_id) DO NOTHING;
-- 'aaaaaaaa-...005' deliberadamente SIN fila en board_members: es el usuario
-- "no miembro" para el Test 3.

-- A partir de aquí, todo corre bajo el rol authenticated real (sin
-- BYPASSRLS) — mismo patrón que 10_acta_billing_rls.sql. Los fixtures de
-- arriba SÍ necesitaban `postgres` (BYPASSRLS); las aserciones de abajo
-- necesitan lo contrario, o "solo admin bloquea" nunca se probaría de
-- verdad (postgres ignora RLS por completo).
SET LOCAL ROLE authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: document_types viene seedeado con los 8 tipos iniciales
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM public.document_types
   WHERE code IN ('POA','RESOURCE_ANALYSIS','SALARIOS','CAPACIDADES','CRONOGRAMA','CATALOGO_TECNICO','CONTRATO','OTROS')),
  8,
  'Test 1: document_types tiene los 8 tipos iniciales ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: admin puede subir (INSERT) un documento
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user_29('aaaaaaaa-0000-0000-0000-000000000001'); -- admin

SELECT lives_ok(
  $$ INSERT INTO public.operational_documents
       (id, board_id, tipo_documento, anio, version_label, title, storage_path, file_name, uploaded_by)
     VALUES
       ('5ca1ab1e-0000-0000-0000-000000002901', 'ec0e0000-0000-0000-0000-000000000029', 'POA', 2026, 'V1',
        'POA 2026 — primera version', 'ec0e0000-0000-0000-0000-000000000029/POA/v1.xlsx', 'v1.xlsx',
        'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'Test 2: admin sube un documento sin error ✓'
);

-- El documento del Test 2 se marca vigente aquí (no en Test 7): el Test 6
-- necesita un vigente REAL ya existente para que el índice único tenga algo
-- con qué chocar — un INSERT con es_vigente=true nunca falla si todavía no
-- hay ningún otro vigente=true para ese (board, tipo).
UPDATE public.operational_documents SET es_vigente = true
WHERE id = '5ca1ab1e-0000-0000-0000-000000002901';

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: un miembro (no admin) NO puede subir un documento — RLS lo bloquea
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user_29('aaaaaaaa-0000-0000-0000-000000000002'); -- assistant (no admin)

SELECT throws_like(
  $$ INSERT INTO public.operational_documents
       (board_id, tipo_documento, version_label, title, storage_path, file_name, uploaded_by)
     VALUES
       ('ec0e0000-0000-0000-0000-000000000029', 'SALARIOS', 'V1', 'Intento de miembro',
        'ec0e0000-0000-0000-0000-000000000029/SALARIOS/x.xlsx', 'x.xlsx',
        'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '%row-level security%',
  'Test 3: un miembro sin rol admin no puede subir documentos ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: un usuario SIN membresía en el board no ve ningún documento
-- (RLS de SELECT filtra en silencio — 0 filas, no una excepción)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user_29('aaaaaaaa-0000-0000-0000-000000000005'); -- sin board_members

SELECT is(
  (SELECT COUNT(*)::INT FROM public.operational_documents WHERE board_id = 'ec0e0000-0000-0000-0000-000000000029'),
  0,
  'Test 4: usuario sin membresía no ve documentos del board (0 filas, RLS silencioso) ✓'
);

-- Confirmar que el documento SÍ existe (visto por el admin) — para que el
-- Test 4 pruebe "RLS lo oculta", no "el INSERT del Test 2 nunca ocurrió".
SELECT _test_set_user_29('aaaaaaaa-0000-0000-0000-000000000001'); -- admin

SELECT is(
  (SELECT COUNT(*)::INT FROM public.operational_documents WHERE board_id = 'ec0e0000-0000-0000-0000-000000000029'),
  1,
  'Test 5: el admin sí ve el documento del Test 2 (confirma que el Test 4 fue RLS, no ausencia real) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: el índice único impide dos documentos vigentes del mismo tipo
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ INSERT INTO public.operational_documents
       (board_id, tipo_documento, version_label, title, storage_path, file_name, uploaded_by, es_vigente)
     VALUES
       ('ec0e0000-0000-0000-0000-000000000029', 'POA', 'V0-duplicado', 'Otro POA vigente',
        'ec0e0000-0000-0000-0000-000000000029/POA/v0.xlsx', 'v0.xlsx',
        'aaaaaaaa-0000-0000-0000-000000000001', true) $$,
  '%idx_operational_documents_vigente%',
  'Test 6: no puede haber dos documentos vigentes del mismo tipo en el mismo board ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7: mark_operational_document_vigente — transición atómica
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.operational_documents
  (id, board_id, tipo_documento, anio, version_label, title, storage_path, file_name, uploaded_by)
VALUES
  ('5ca1ab1e-0000-0000-0000-000000002902', 'ec0e0000-0000-0000-0000-000000000029', 'POA', 2026, 'V2',
   'POA 2026 — version corregida', 'ec0e0000-0000-0000-0000-000000000029/POA/v2.xlsx', 'v2.xlsx',
   'aaaaaaaa-0000-0000-0000-000000000001');

SELECT mark_operational_document_vigente('5ca1ab1e-0000-0000-0000-000000002902');

SELECT is(
  (SELECT array_agg(version_label ORDER BY version_label)
   FROM public.operational_documents
   WHERE board_id = 'ec0e0000-0000-0000-0000-000000000029' AND tipo_documento = 'POA' AND es_vigente),
  ARRAY['V2'],
  'Test 7: mark_operational_document_vigente desmarca V1 y marca V2 atomicamente (solo V2 queda vigente) ✓'
);

SELECT * FROM finish();
ROLLBACK;
