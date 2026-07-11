-- =============================================================================
-- Tests: import_poa_version — Commits 1-2/4 (firma + precondiciones + RLS +
-- idempotencia por operación + creación de poa_version)
--
-- CONTRATO: supabase/migrations/20260721_import_poa_version.sql,
-- supabase/migrations/20260722_import_poa_version_idempotency.sql,
-- supabase/migrations/20260723_import_poa_version_create_version.sql.
--
-- Alcance de Commit 2: la función crea exactamente un registro en
-- poa_versions (status='draft', version_number correcto, created_by,
-- import_operation_id) y devuelve su id. NO inserta poa_activities ni
-- poa_activity_zones todavía (Commits 3-4) — por eso, cuando p_activities
-- trae al menos un elemento, la función sigue lanzando "pendiente de
-- implementar" después de crear la versión, y esa creación debe revertirse
-- por completo (Test 11 — el punto más importante de este archivo: no
-- asumir que "Postgres hace transacciones", demostrarlo).
--
-- Con p_activities = '[]' (sin actividades) la función SÍ completa
-- exitosamente hoy — es el único caso de éxito de punta a punta posible en
-- el alcance actual, y es lo que permite probar creación y numeración de
-- versiones sin inventar una función auxiliar con su propia superficie de
-- autorización paralela.
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
-- (leader). Dos pares board/poa con prefijo 55555555, propios de este
-- archivo — el segundo par (Tests 8-11) existe para que la numeración de
-- versiones se pruebe desde cero, sin interferencia de la fila sembrada
-- manualmente en el Test 6.
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

SELECT plan(16);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures — board/poa #1 (Tests 1-7)
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
VALUES ('55555555-0000-0000-0000-0000000000aa', '55555555-0000-0000-0000-000000000001', 'POA Test Import Version')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

-- Fixtures — board/poa #2 (Tests 8-11, numeración desde cero)

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('55555555-0000-0000-0000-000000000002', 'Test Board Import POA 2', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('55555555-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('55555555-0000-0000-0000-0000000000ff', '55555555-0000-0000-0000-000000000002', 'POA Test Version Numbering')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

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
-- Test 4: con actividades reales, la inserción todavía no está implementada
-- (Commits 3-4) — a partir de Commit 2, un array VACÍO ya no prueba esto
-- (completa con éxito), por eso este test usa un elemento no vacío.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000aa',
       '[{"activity_key":"1.01"}]'::JSONB
     ) $$,
  '%pendiente de implementar%',
  'Test 4: con actividades no vacías, la función confirma que la inserción real no existe todavía ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: poa_versions/poa_activities/poa_activity_zones ya no tienen
-- ninguna política de escritura — el único camino es import_poa_version().
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('poa_versions', 'poa_activities', 'poa_activity_zones')
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'Test 5: ninguna de las tres tablas tiene una política RLS de escritura directa ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: idempotencia — reintentar con el mismo p_import_operation_id
-- devuelve la versión ya creada, no lanza error. Fila sembrada manualmente
-- para aislar la ruta de lectura de idempotencia de la lógica de creación
-- real (probada por separado en Tests 8-11).
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
  'Test 6: reintentar con el mismo import_operation_id devuelve la poa_version existente, sin error ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7: un import_operation_id nuevo (no visto antes), con actividades no
-- vacías, SÍ atraviesa hasta el cuerpo pendiente de implementar — la
-- idempotencia no enmascara otros errores ni bloquea operaciones nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000aa',
       '[{"activity_key":"1.01"}]'::JSONB,
       '55555555-0000-0000-0000-0000000000dd'
     ) $$,
  '%pendiente de implementar%',
  'Test 7: un import_operation_id distinto no es idempotente contra uno ajeno — sigue el flujo normal ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8: creación exitosa — sin actividades, la función completa de punta
-- a punta y deja exactamente una fila en poa_versions.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_version_id UUID;
BEGIN
  v_version_id := public.import_poa_version(
    '55555555-0000-0000-0000-0000000000ff', '[]'::JSONB,
    '55555555-0000-0000-0000-000000001001'
  );
  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'Test 8: import_poa_version no devolvió un id';
  END IF;
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'),
  1,
  'Test 8: creación exitosa deja exactamente una fila en poa_versions ✓'
);

SELECT results_eq(
  $$ SELECT version_number, status, created_by
     FROM public.poa_versions
     WHERE poa_id = '55555555-0000-0000-0000-0000000000ff' $$,
  $$ VALUES (1, 'draft'::TEXT, 'aaaaaaaa-0000-0000-0000-000000000001'::UUID) $$,
  'Test 9: primera versión creada con version_number=1, status=draft, created_by correcto ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 10: numeración correcta — una segunda creación para el mismo poa_id
-- obtiene version_number=2, no reutiliza ni colisiona con la primera.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  PERFORM public.import_poa_version(
    '55555555-0000-0000-0000-0000000000ff', '[]'::JSONB,
    '55555555-0000-0000-0000-000000001002'
  );
END;
$$;

SELECT is(
  (SELECT version_number FROM public.poa_versions
   WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'
     AND import_operation_id = '55555555-0000-0000-0000-000000001002'),
  2,
  'Test 10: la segunda versión del mismo poa_id obtiene version_number=2 ✓'
);

-- Reintentar la primera operación (idempotencia real, no fila sembrada)
-- debe seguir devolviendo la misma versión — no crea una tercera fila.

SELECT is(
  (SELECT public.import_poa_version(
     '55555555-0000-0000-0000-0000000000ff', '[]'::JSONB,
     '55555555-0000-0000-0000-000000001001'
   ))::TEXT,
  (SELECT id::TEXT FROM public.poa_versions
   WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'
     AND import_operation_id = '55555555-0000-0000-0000-000000001001'),
  'Test 10b: reintentar la primera operación real sigue devolviendo la misma versión ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'),
  2,
  'Test 10c: tras el reintento, siguen existiendo exactamente 2 versiones (no 3) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 11: EL TEST MÁS IMPORTANTE DE ESTE ARCHIVO. Una operación nueva con
-- actividades no vacías falla (Commits 3-4 pendientes) — se verifica
-- explícitamente que la poa_version creada DENTRO de la misma llamada
-- también se revirtió. No basta con que Postgres "haga transacciones": se
-- demuestra que ningún registro huérfano sobrevive al fallo.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000ff',
       '[{"activity_key":"1.01"}]'::JSONB,
       '55555555-0000-0000-0000-000000001099'
     ) $$,
  '%pendiente de implementar%',
  'Test 11a: una operación con actividades falla como se espera (Commits 3-4 pendientes) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions
   WHERE import_operation_id = '55555555-0000-0000-0000-000000001099'),
  0,
  'Test 11b: no queda ninguna poa_version huérfana de la operación que falló ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions WHERE poa_id = '55555555-0000-0000-0000-0000000000ff'),
  2,
  'Test 11c: el total de versiones de este poa_id sigue siendo 2 — el fallo no dejó rastro ✓'
);

SELECT * FROM finish();
ROLLBACK;
