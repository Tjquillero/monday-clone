-- =============================================================================
-- Tests: import_poa_version — Commit 1/4 (firma + precondiciones + RLS +
-- idempotencia por operación)
--
-- CONTRATO: supabase/migrations/20260721_import_poa_version.sql,
-- supabase/migrations/20260722_import_poa_version_idempotency.sql.
-- Este archivo cubre únicamente el alcance del Commit 1: la función existe,
-- valida sus precondiciones mínimas (poa existe, permiso admin, formato del
-- JSON), es idempotente por p_import_operation_id, y las tablas del dominio
-- ya no aceptan INSERT directo desde el cliente. NO cubre la persistencia
-- real de actividades/zonas — eso se prueba en los archivos de los
-- Commits 2-4.
--
-- Idempotencia (Test 6): un reintento con el mismo p_import_operation_id
-- debe devolver la poa_version ya creada, nunca lanzar error ni crear una
-- fila nueva — mismo criterio que processed_domain_commands (Incremento
-- 4a). Se prueba sembrando directamente la fila "ya creada" (los Commits
-- 2-4 todavía no existen) y verificando que la función la reconoce sin
-- pasar por el resto del cuerpo (que seguiría lanzando "pendiente de
-- implementar" si la idempotencia no cortara antes).
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
-- (leader). Board/poa con prefijo 55555555, propio de este archivo.
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

SELECT plan(8);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures
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
-- Test 4: con precondiciones válidas, todavía no implementada (Commit 1)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version('55555555-0000-0000-0000-0000000000aa', '[]'::JSONB) $$,
  '%pendiente de implementar%',
  'Test 4: con precondiciones válidas, la función confirma que el cuerpo real no existe todavía ✓'
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
-- devuelve la versión ya creada, no lanza error.
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
-- Test 7: un import_operation_id nuevo (no visto antes) SÍ atraviesa hasta
-- el cuerpo pendiente de implementar — la idempotencia no enmascara otros
-- errores ni bloquea operaciones legítimas nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000aa', '[]'::JSONB,
       '55555555-0000-0000-0000-0000000000dd'
     ) $$,
  '%pendiente de implementar%',
  'Test 7: un import_operation_id distinto no es idempotente contra uno ajeno — sigue el flujo normal ✓'
);

SELECT * FROM finish();
ROLLBACK;
