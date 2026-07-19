-- =============================================================================
-- Tests: import_poa_version — Commits 1-4/4 (función completa)
--
-- CONTRATO: supabase/migrations/20260721_import_poa_version.sql,
-- supabase/migrations/20260722_import_poa_version_idempotency.sql,
-- supabase/migrations/20260723_import_poa_version_create_version.sql,
-- supabase/migrations/20260724_import_poa_version_activities.sql,
-- supabase/migrations/20260725_import_poa_version_zones_and_activation.sql.
--
-- Este archivo reemplaza por completo la versión anterior (Commits 2-3):
-- aquellos tests dependían de un estado "pendiente de implementar" que ya
-- no existe — la función ahora se completa o revierte por completo, sin
-- estados intermedios. Las versiones anteriores de este archivo, con esos
-- tests, quedan en el historial de git para quien necesite ver la
-- progresión.
--
-- Cambio de contrato en este commit: `zonas: []` en una actividad YA NO es
-- un caso de éxito aislado — toda actividad debe traer al menos una zona.
-- Enviar una sin zonas es ahora un error explícito (Test 13).
--
-- Invariante más importante de todo el importador (Tests 12-15): cualquier
-- fallo — FK inexistente, actividad sin zonas, o cualquier otro — revierte
-- las TRES tablas (poa_versions, poa_activities, poa_activity_zones) sin
-- dejar rastro, y NUNCA dejar una versión en 'active' con datos parciales.
-- El Test 15 verifica además que un fallo sobre un poa con una versión ya
-- activa no la toca — ni la cierra ni la corrompe.
--
-- Nota sobre autorización: a diferencia de 04_poa_zone_mappings.sql (Test 6,
-- corregido — SET ROLE postgres bypassa RLS), la verificación de "no-admin
-- rechazado" AQUÍ sí es válida en vivo, porque can_manage_poa() no depende
-- de RLS: es un chequeo explícito en PL/pgSQL dentro de la función
-- SECURITY DEFINER, basado en auth.uid() (que lee request.jwt.claims,
-- independiente del rol de Postgres activo) — mismo patrón que
-- can_report_execution()/replace_weekly_plan_items().
--
-- Usuarios reales reutilizados de otros archivos de esta suite (existen en
-- auth.users del proyecto): aaaaaaaa-...-000001 (admin), aaaaaaaa-...-000003
-- (leader). Cuatro pares board/poa con prefijo 55555555, propios de este
-- archivo, cada uno aislando un grupo de escenarios distinto.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql):
-- corrompe el contador interno de pgTAP.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/05_import_poa_version.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(25);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures — board/poa #1 (Tests 1-3, 5-6): solo precondiciones, sin llegar
-- nunca a insertar nada real.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('55555555-0000-0000-0000-000000000001', 'Test Board Import POA', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('55555555-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('55555555-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'leader')
ON CONFLICT (board_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_set_user(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user_id)::TEXT, true);
$$;

INSERT INTO public.poa (id, board_id, name)
VALUES ('55555555-0000-0000-0000-0000000000aa', '55555555-0000-0000-0000-000000000001', 'POA Test Preconditions')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

-- Fixtures — board/poa #2 (Tests 7-11): importación real, con zonas reales.

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('55555555-0000-0000-0000-000000000002', 'Test Board Import POA 2', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('55555555-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position) VALUES
  ('88888888-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 'Zona Test 1', '#00FF00', 0),
  ('88888888-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', 'Zona Test 2', '#00FF00', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('55555555-0000-0000-0000-0000000000ff', '55555555-0000-0000-0000-000000000002', 'POA Test Full Import')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

-- Fixtures — board/poa #3 (Tests 12-14): atomicidad ante fallos.

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('55555555-0000-0000-0000-000000000003', 'Test Board Import POA 3', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('55555555-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('55555555-0000-0000-0000-0000000000ee', '55555555-0000-0000-0000-000000000003', 'POA Test Atomicity')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

-- Fixtures — board/poa #4 (Test 15): un poa con una versión YA activa,
-- para verificar que un fallo posterior no la toca.

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('55555555-0000-0000-0000-000000000004', 'Test Board Import POA 4', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('55555555-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('55555555-0000-0000-0000-0000000000dd', '55555555-0000-0000-0000-000000000004', 'POA Test Preexisting Active')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

INSERT INTO public.poa_versions (
  id, poa_id, version_number, status, created_by, published_at
) VALUES (
  '55555555-0000-0000-0000-000000000dd1',
  '55555555-0000-0000-0000-0000000000dd',
  1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001', NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: poa inexistente
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin

SELECT throws_like(
  $$ SELECT public.import_poa_version('77777777-0000-0000-0000-000000000099', '[]'::JSONB) $$,
  '%no encontrado%',
  'Test 1: import_poa_version rechaza un poa_id inexistente ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: usuario no-admin del board rechazado (chequeo en código, no RLS)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000003'); -- leader

SELECT throws_like(
  $$ SELECT public.import_poa_version('55555555-0000-0000-0000-0000000000aa', '[]'::JSONB) $$,
  '%Sin permiso%',
  'Test 2: un leader (no-admin) no puede llamar a import_poa_version ✓'
);

SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin de nuevo

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: p_activities debe ser un array JSON
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version('55555555-0000-0000-0000-0000000000aa', '{"no":"es un array"}'::JSONB) $$,
  '%debe ser un array%',
  'Test 3: p_activities rechaza un objeto JSON que no es array ✓'
);

SELECT throws_like(
  $$ SELECT public.import_poa_version('55555555-0000-0000-0000-0000000000aa', NULL) $$,
  '%debe ser un array%',
  'Test 3b: p_activities rechaza NULL ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: poa_versions/poa_activities/poa_activity_zones ya no tienen
-- ninguna política de escritura — el único camino es import_poa_version().
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('poa_versions', 'poa_activities', 'poa_activity_zones')
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'Test 4: ninguna de las tres tablas tiene una política RLS de escritura directa ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: idempotencia — reintentar con el mismo p_import_operation_id
-- devuelve la versión ya creada, no lanza error. Fila sembrada manualmente
-- para aislar la ruta de lectura de idempotencia de la inserción real
-- (probada por separado en Tests 7-11).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.poa_versions (
  id, poa_id, version_number, status, created_by, import_operation_id
) VALUES (
  '55555555-0000-0000-0000-0000000000bb',
  '55555555-0000-0000-0000-0000000000aa',
  1, 'draft', 'aaaaaaaa-0000-0000-0000-000000000001',
  '55555555-0000-0000-0000-0000000000cc'
)
ON CONFLICT (id) DO NOTHING;

SELECT is(
  public.import_poa_version(
    '55555555-0000-0000-0000-0000000000aa',
    '[]'::JSONB,
    '55555555-0000-0000-0000-0000000000cc'
  )::TEXT,
  '55555555-0000-0000-0000-0000000000bb',
  'Test 5: reintentar con el mismo import_operation_id devuelve la poa_version existente, sin error ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: importación exitosa de punta a punta — 2 actividades, 3 zonas en
-- total (una de ellas con las zonas en orden invertido respecto a los
-- grupos, para poder verificar zone_import_order en el Test 8).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_version_id UUID;
BEGIN
  v_version_id := public.import_poa_version(
    '55555555-0000-0000-0000-0000000000ff',
    $json$[
      {"activity_key":"1.01","description":"Actividad Test 1.01","unit":"M2","precio_unitario":100.50,"frecuencia":1,
       "zonas":[
         {"group_id":"88888888-0000-0000-0000-000000000002","cantidad_contratada":20},
         {"group_id":"88888888-0000-0000-0000-000000000001","cantidad_contratada":10}
       ]},
      {"activity_key":"1.02","description":"Actividad Test 1.02","unit":"M2","precio_unitario":200.75,"frecuencia":2,
       "zonas":[{"group_id":"88888888-0000-0000-0000-000000000001","cantidad_contratada":5}]}
    ]$json$::JSONB,
    '55555555-0000-0000-0000-000000003001'
  );
  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'Test 6: import_poa_version no devolvió un id';
  END IF;
END;
$$;

SELECT results_eq(
  $$ SELECT version_number, status, created_by, published_by IS NOT NULL, published_at IS NOT NULL
     FROM public.poa_versions
     WHERE poa_id = '55555555-0000-0000-0000-0000000000ff' $$,
  $$ VALUES (1, 'active'::TEXT, 'aaaaaaaa-0000-0000-0000-000000000001'::UUID, TRUE, TRUE) $$,
  'Test 6: la versión queda version_number=1, status=active, published_by/published_at poblados ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ff'),
  2,
  'Test 6b: se insertaron las 2 poa_activities ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7: propagación correcta de los campos de zona (group_id →
-- poa_activity_zones.zone_id, cantidad_contratada) para las 3 zonas en total.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activity_zones paz
   JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ff'),
  3,
  'Test 7: se insertaron las 3 poa_activity_zones esperadas (2 + 1) ✓'
);

SELECT results_eq(
  $$ SELECT paz.zone_id, paz.cantidad_contratada
     FROM public.poa_activity_zones paz
     JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
     JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
     WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ff'
       AND pa.activity_key = '1.02' $$,
  $$ VALUES ('88888888-0000-0000-0000-000000000001'::UUID, 5::NUMERIC) $$,
  'Test 7b: zone_id y cantidad_contratada de la actividad 1.02 se propagan exactamente ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8: zone_import_order preserva el orden de llegada DENTRO de cada
-- actividad, independiente de import_order de la actividad — la actividad
-- 1.01 envió sus zonas como [Zona 2, Zona 1] (invertido respecto al id).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT results_eq(
  $$ SELECT paz.zone_id, paz.zone_import_order
     FROM public.poa_activity_zones paz
     JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
     JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
     WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ff'
       AND pa.activity_key = '1.01'
     ORDER BY paz.zone_import_order $$,
  $$ VALUES
       ('88888888-0000-0000-0000-000000000002'::UUID, 0),
       ('88888888-0000-0000-0000-000000000001'::UUID, 1) $$,
  'Test 8: zone_import_order = 0 para Zona 2 (enviada primero), 1 para Zona 1 — no ordena por group_id ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 9: una segunda importación exitosa sobre el mismo poa_id cierra la
-- primera (Regla 12: una sola versión activa) y activa la nueva.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  PERFORM public.import_poa_version(
    '55555555-0000-0000-0000-0000000000ff',
    $json$[{"activity_key":"2.01","description":"Actividad Test 2.01","unit":"M2","precio_unitario":50,"frecuencia":1,
            "zonas":[{"group_id":"88888888-0000-0000-0000-000000000001","cantidad_contratada":1}]}]$json$::JSONB,
    '55555555-0000-0000-0000-000000003002'
  );
END;
$$;

SELECT results_eq(
  $$ SELECT version_number, status, closed_at IS NOT NULL
     FROM public.poa_versions
     WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'
     ORDER BY version_number $$,
  $$ VALUES (1, 'closed'::TEXT, TRUE), (2, 'active'::TEXT, FALSE) $$,
  'Test 9: v1 pasa a closed (con closed_at) y v2 queda active — nunca dos activas a la vez ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 10: la idempotencia se conserva tras la activación real — reintentar
-- la primera operación devuelve v1, aunque ya esté 'closed'.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT public.import_poa_version(
     '55555555-0000-0000-0000-0000000000ff',
     $json$[{"activity_key":"1.01","description":"Actividad Test 1.01","unit":"M2","precio_unitario":100.50,"frecuencia":1,
             "zonas":[
               {"group_id":"88888888-0000-0000-0000-000000000002","cantidad_contratada":20},
               {"group_id":"88888888-0000-0000-0000-000000000001","cantidad_contratada":10}
             ]},
            {"activity_key":"1.02","description":"Actividad Test 1.02","unit":"M2","precio_unitario":200.75,"frecuencia":2,
             "zonas":[{"group_id":"88888888-0000-0000-0000-000000000001","cantidad_contratada":5}]}]$json$::JSONB,
     '55555555-0000-0000-0000-000000003001'
   ))::TEXT,
  (SELECT id::TEXT FROM public.poa_versions
   WHERE poa_id = '55555555-0000-0000-0000-0000000000ff' AND version_number = 1),
  'Test 10: reintentar la primera operación devuelve v1 aunque ya esté closed — la idempotencia no depende del status ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'),
  2,
  'Test 10b: tras el reintento, siguen existiendo exactamente 2 versiones (no 3) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 11: un group_id inexistente viola la FK de poa_activity_zones — la
-- importación completa se revierte: NI poa_version, NI poa_activities, NI
-- poa_activity_zones sobreviven.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000ee',
       $j$[{"activity_key":"1.01","description":"Actividad Test 1.01","unit":"M2","precio_unitario":100,"frecuencia":1,
            "zonas":[{"group_id":"99999999-0000-0000-0000-000000000001","cantidad_contratada":1}]}]$j$::JSONB,
       '55555555-0000-0000-0000-000000004001'
     ) $$,
  '%violates foreign key constraint%',
  'Test 11: un group_id inexistente falla por violación de FK (foreign_key_violation) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions
   WHERE import_operation_id = '55555555-0000-0000-0000-000000004001'),
  0,
  'Test 11b: no queda ninguna poa_version huérfana ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ee'),
  0,
  'Test 11c: no queda ninguna poa_activities huérfana ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 12: una actividad sin ninguna zona es rechazada explícitamente — ya
-- no es un caso de éxito (cambio de contrato de este commit).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000ee',
       '[{"activity_key":"1.01","description":"Actividad Test 1.01","unit":"M2","precio_unitario":100,"frecuencia":1,"zonas":[]}]'::JSONB,
       '55555555-0000-0000-0000-000000004002'
     ) $$,
  '%sin ninguna zona asociada%',
  'Test 12: una actividad con zonas:[] es rechazada explícitamente ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions
   WHERE import_operation_id = '55555555-0000-0000-0000-000000004002'),
  0,
  'Test 12b: tampoco deja ninguna poa_version huérfana ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 13: tras los dos fallos anteriores (Tests 11-12), este poa sigue sin
-- ninguna versión — no quedó en un estado corrupto que afecte la
-- numeración de una importación exitosa posterior.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '55555555-0000-0000-0000-0000000000ee'),
  0,
  'Test 13: ningún intento fallido dejó rastro — el poa sigue sin versiones ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 14: EL TEST MÁS IMPORTANTE DE ESTE ARCHIVO. Un poa con una versión
-- YA activa sufre un intento de importación fallido — la versión activa
-- preexistente NO debe tocarse (ni cerrarse, ni corromperse). Nunca debe
-- existir un momento observable donde el sistema quede sin ninguna versión
-- activa, ni con una versión activa a medio construir.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000dd',
       $j$[{"activity_key":"1.01","description":"Actividad Test 1.01","unit":"M2","precio_unitario":100,"frecuencia":1,
            "zonas":[{"group_id":"99999999-0000-0000-0000-000000000001","cantidad_contratada":1}]}]$j$::JSONB,
       '55555555-0000-0000-0000-000000004003'
     ) $$,
  '%violates foreign key constraint%',
  'Test 14a: la importación fallida sobre un poa con versión activa preexistente falla como se espera ✓'
);

SELECT results_eq(
  $$ SELECT status, closed_at IS NULL
     FROM public.poa_versions
     WHERE id = '55555555-0000-0000-0000-000000000dd1' $$,
  $$ VALUES ('active'::TEXT, TRUE) $$,
  'Test 14b: la versión activa preexistente sigue active, sin closed_at — el fallo no la tocó ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '55555555-0000-0000-0000-0000000000dd'),
  1,
  'Test 14c: sigue existiendo exactamente 1 versión para este poa — el intento fallido no dejó una segunda fila ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 15: frecuencia = NULL es un valor de negocio válido, no un error de
-- dato. Decisión registrada en ADR-0005 — una actividad puede permanecer
-- contratada (cantidad_contratada > 0) sin programación periódica en esta
-- versión del POA. Reutiliza board/poa #2 (Tests 7-11), zonas reales.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT lives_ok(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000ff',
       $j$[{"activity_key":"9.99","description":"Actividad Test 9.99","unit":"M2","precio_unitario":100,"frecuencia":null,
            "zonas":[{"group_id":"88888888-0000-0000-0000-000000000001","cantidad_contratada":1}]}]$j$::JSONB,
       '55555555-0000-0000-0000-000000004004'
     ) $$,
  'Test 15a: frecuencia = null se acepta y no aborta la importación ✓'
);

SELECT is(
  (SELECT frecuencia FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.import_operation_id = '55555555-0000-0000-0000-000000004004'
     AND pa.activity_key = '9.99'),
  NULL::NUMERIC,
  'Test 15b: la fila persistida tiene frecuencia IS NULL, no un valor inventado ✓'
);

SELECT * FROM finish();
ROLLBACK;
