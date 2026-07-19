-- =============================================================================
-- Regresión: separación de fases Contractual vs. Técnica
--
-- Ref: docs/architecture/poa-technical-catalog-decoupling.md
-- CONTRATO: import_poa_version() (supabase/migrations/20260721..20260825),
--           get_missing_board_activity_standards() (20260825).
--
-- Congela la frontera del rediseño con los tres casos exactos que motivaron
-- el cambio, en secuencia, contra las funciones REALES (no fixtures
-- sintéticos aislados):
--
--   Caso A: importar un POA sin ninguna fila en board_activity_standards
--           para esa actividad -> DEBE importar correctamente.
--   Caso B: consultar qué falta para generar el Cronograma -> DEBE señalar
--           exactamente esa actividad como pendiente.
--   Caso C: insertar el board_activity_standards faltante (SIN volver a
--           importar el POA) -> la actividad DEBE dejar de aparecer como
--           pendiente, usando la MISMA poa_version ya creada en el Caso A.
--
-- Si en el futuro alguien reintroduce un chequeo cruzado contra
-- board_activity_standards dentro de import_poa_version() (pensando que
-- "corrige un bug"), el Caso A de este archivo debe fallar de inmediato.
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
-- Fixtures (prefijo ec0e0000...0027 / 5ca1ab1e...27NN)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000027', 'Test Board Phase Separation', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000027', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000002701', 'ec0e0000-0000-0000-0000-000000000027', 'Sitio Test Fase Separación', '#3B7EF8', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('5ca1ab1e-0000-0000-0000-00000000270a', 'ec0e0000-0000-0000-0000-000000000027', 'POA Test Fase Separación')
ON CONFLICT (id) DO NOTHING;

-- Confirmación previa: board_activity_standards está VACÍO para este board
-- antes de importar — no hay ninguna fila que pudiera "colarse" y viciar
-- el Caso A.
SELECT is(
  (SELECT COUNT(*)::INT FROM public.board_activity_standards WHERE board_id = 'ec0e0000-0000-0000-0000-000000000027'),
  0,
  'Precondición: board_activity_standards vacío para este board antes de importar ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Caso A: import_poa_version() con una actividad SIN ninguna fila de
-- catálogo técnico -> debe importar correctamente (no bloquea).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_version_id UUID;
BEGIN
  v_version_id := public.import_poa_version(
    '5ca1ab1e-0000-0000-0000-00000000270a',
    $json$[{"activity_key":"PSR_01","description":"Actividad sin catálogo técnico","unit":"M2",
            "precio_unitario":100,"frecuencia":25,
            "zonas":[{"group_id":"5ca1ab1e-0000-0000-0000-000000002701","cantidad_contratada":50}]}]$json$::JSONB,
    'ec0e0000-0000-0000-0000-000000005001'
  );
  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'Caso A: import_poa_version no devolvió un id';
  END IF;
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '5ca1ab1e-0000-0000-0000-00000000270a' AND pa.activity_key = 'PSR_01'),
  1,
  'Caso A: la actividad se importó correctamente aunque board_activity_standards siga vacío ✓'
);

SELECT results_eq(
  $$ SELECT status FROM public.poa_versions WHERE poa_id = '5ca1ab1e-0000-0000-0000-00000000270a' $$,
  $$ VALUES ('active'::TEXT) $$,
  'Caso A: la versión queda active — la importación no se marcó como bloqueada ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Caso B: get_missing_board_activity_standards() debe señalar exactamente
-- esta actividad como pendiente de configuración técnica.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT results_eq(
  $$ SELECT activity_key, description, unit
     FROM public.get_missing_board_activity_standards(
       'ec0e0000-0000-0000-0000-000000000027',
       (SELECT id FROM public.poa_versions WHERE poa_id = '5ca1ab1e-0000-0000-0000-00000000270a')
     ) $$,
  $$ VALUES ('PSR_01'::TEXT, 'Actividad sin catálogo técnico'::TEXT, 'M2'::TEXT) $$,
  'Caso B: PSR_01 aparece como pendiente de configuración técnica, con su description/unit reales ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Caso C: insertar el board_activity_standards faltante (SIN volver a
-- importar) resuelve el bloqueo — misma poa_version del Caso A.
-- ─────────────────────────────────────────────────────────────────────────────

-- `frecuencia` ya NO vive en board_activity_standards (ADR-0002, DROP COLUMN
-- en 20260714_poa_domain_schema.sql) — vive en poa_activities, ya presente
-- desde el Caso A.
INSERT INTO public.board_activity_standards (board_id, activity_key, name, category, unit, rendimiento)
VALUES ('ec0e0000-0000-0000-0000-000000000027', 'PSR_01', 'Actividad sin catálogo técnico', 'ZONA VERDE', 'M2', 500);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_missing_board_activity_standards(
     'ec0e0000-0000-0000-0000-000000000027',
     (SELECT id FROM public.poa_versions WHERE poa_id = '5ca1ab1e-0000-0000-0000-00000000270a')
   )),
  0,
  'Caso C: tras completar el catálogo técnico (sin reimportar), PSR_01 deja de estar pendiente ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '5ca1ab1e-0000-0000-0000-00000000270a'),
  1,
  'Caso C: sigue existiendo exactamente 1 poa_version — la resolución fue de catálogo técnico, no una reimportación ✓'
);

SELECT * FROM finish();
ROLLBACK;
