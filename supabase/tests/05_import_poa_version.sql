-- =============================================================================
-- Tests: import_poa_version — Commits 1-3/4 (firma + precondiciones + RLS +
-- idempotencia por operación + creación de poa_version + poa_activities)
--
-- CONTRATO: supabase/migrations/20260721_import_poa_version.sql,
-- supabase/migrations/20260722_import_poa_version_idempotency.sql,
-- supabase/migrations/20260723_import_poa_version_create_version.sql,
-- supabase/migrations/20260724_import_poa_version_activities.sql.
--
-- Alcance de Commit 2: la función crea exactamente un registro en
-- poa_versions (status='draft', version_number correcto, created_by,
-- import_operation_id) y devuelve su id.
--
-- Alcance de Commit 3: además, inserta poa_activities preservando el orden
-- de p_activities (import_order). NO inserta poa_activity_zones todavía
-- (Commit 4) ni cambia el status de la versión — por eso, cuando alguna
-- actividad trae al menos una zona, la función sigue lanzando "pendiente de
-- implementar" después de insertar poa_activities, y TODO debe revertirse
-- (poa_version + poa_activities) — Test 15, el punto más importante de esta
-- sección: no asumir que "Postgres hace transacciones", demostrarlo, un
-- nivel más profundo que el Test 11 del Commit 2.
--
-- Con p_activities = '[]' (Commit 2) o con actividades cuyo `zonas` sea `[]`
-- en cada elemento (Commit 3) la función SÍ completa exitosamente hoy — es
-- el único caso de éxito de punta a punta posible en el alcance actual de
-- cada commit, y es lo que permite probar cada capa sin inventar una
-- función auxiliar con su propia superficie de autorización paralela. En
-- datos reales, toda actividad validada por las capas 1-3 siempre trae al
-- menos una zona — el caso "zonas: []" es exclusivamente para aislar esta
-- capa del Commit 4, que todavía no existe.
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
-- (leader). Tres pares board/poa con prefijo 55555555, propios de este
-- archivo — el segundo par (Tests 8-11) existe para que la numeración de
-- versiones se pruebe desde cero, sin interferencia de la fila sembrada
-- manualmente en el Test 6; el tercer par (Tests 12-16) aísla las pruebas
-- de poa_activities de ambos.
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

-- Fixtures — board/poa #3 (Tests 12-16, poa_activities)

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('55555555-0000-0000-0000-000000000003', 'Test Board Import POA 3', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('55555555-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.poa (id, board_id, name)
VALUES ('55555555-0000-0000-0000-0000000000ee', '55555555-0000-0000-0000-000000000003', 'POA Test Activities')
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
-- Test 4: con una actividad que trae zonas, la inserción de zonas todavía no
-- está implementada (Commit 4) — desde Commit 3, poa_activities SÍ se
-- inserta, así que el punto de fallo se movió: ya no es "hay actividades",
-- es "alguna actividad trae zonas". El payload debe ser una actividad
-- completa y válida (activity_key, precio_unitario, frecuencia) para que el
-- fallo ocurra en el paso de zonas, no antes por un NOT NULL de columna.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000aa',
       '[{"activity_key":"1.01","precio_unitario":100,"frecuencia":1,
          "zonas":[{"group_id":"66666666-0000-0000-0000-000000000001","cantidad_contratada":10}]}]'::JSONB
     ) $$,
  '%pendiente de implementar%',
  'Test 4: una actividad con zonas confirma que la inserción de zonas no existe todavía (Commit 4) ✓'
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
-- Test 7: un import_operation_id nuevo (no visto antes), con una actividad
-- que trae zonas, SÍ atraviesa hasta el cuerpo pendiente de implementar
-- (Commit 4) — la idempotencia no enmascara otros errores ni bloquea
-- operaciones nuevas.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000aa',
       '[{"activity_key":"1.01","precio_unitario":100,"frecuencia":1,
          "zonas":[{"group_id":"66666666-0000-0000-0000-000000000001","cantidad_contratada":10}]}]'::JSONB,
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
-- Test 11: una operación nueva con una actividad que trae zonas falla
-- (Commit 4 pendiente) — se verifica explícitamente que la poa_version
-- creada DENTRO de la misma llamada también se revirtió. No basta con que
-- Postgres "haga transacciones": se demuestra que ningún registro huérfano
-- sobrevive al fallo. (Ampliado a poa_activities en el Test 15, una vez que
-- Commit 3 empieza a insertarlas.)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000ff',
       '[{"activity_key":"1.01","precio_unitario":100,"frecuencia":1,
          "zonas":[{"group_id":"66666666-0000-0000-0000-000000000001","cantidad_contratada":10}]}]'::JSONB,
       '55555555-0000-0000-0000-000000001099'
     ) $$,
  '%pendiente de implementar%',
  'Test 11a: una operación con una actividad con zonas falla como se espera (Commit 4 pendiente) ✓'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 12: creación exitosa de poa_activities — 3 actividades, sin zonas
-- (aísla esta capa del Commit 4, que todavía no existe).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_version_id UUID;
BEGIN
  v_version_id := public.import_poa_version(
    '55555555-0000-0000-0000-0000000000ee',
    $json$[
      {"activity_key":"1.01","precio_unitario":100.50,"frecuencia":1,"zonas":[]},
      {"activity_key":"1.02","precio_unitario":200.75,"frecuencia":2,"zonas":[]},
      {"activity_key":"1.03","precio_unitario":300.00,"frecuencia":0.5,"zonas":[]}
    ]$json$::JSONB,
    '55555555-0000-0000-0000-000000002001'
  );
  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'Test 12: import_poa_version no devolvió un id';
  END IF;
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ee'),
  3,
  'Test 12: las 3 actividades se insertaron en poa_activities ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 13: propagación correcta de los campos contractuales (activity_key,
-- precio_unitario, frecuencia) — sin transformación ni pérdida de precisión.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT results_eq(
  $$ SELECT activity_key, precio_unitario, frecuencia
     FROM public.poa_activities pa
     JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
     WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ee'
     ORDER BY pa.import_order $$,
  $$ VALUES
       ('1.01'::TEXT, 100.50::NUMERIC, 1::NUMERIC),
       ('1.02'::TEXT, 200.75::NUMERIC, 2::NUMERIC),
       ('1.03'::TEXT, 300.00::NUMERIC, 0.5::NUMERIC) $$,
  'Test 13: activity_key/precio_unitario/frecuencia se propagan exactamente desde el JSON ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 14: import_order preserva el orden de llegada del array (0-indexado),
-- no el orden alfabético de activity_key ni el de inserción física.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT results_eq(
  $$ SELECT activity_key, import_order
     FROM public.poa_activities pa
     JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
     WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ee'
     ORDER BY import_order $$,
  $$ VALUES ('1.01'::TEXT, 0), ('1.02'::TEXT, 1), ('1.03'::TEXT, 2) $$,
  'Test 14: import_order coincide con la posición en el array enviado ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 15: EL TEST MÁS IMPORTANTE DE ESTA SECCIÓN. Una operación con una
-- actividad que trae zonas falla en el paso de zonas (Commit 4 pendiente) —
-- se verifica que NI la poa_version NI las poa_activities recién insertadas
-- sobreviven. Un nivel más profundo que el Test 11: aquí ya hay dos tablas
-- involucradas, no una.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT throws_like(
  $$ SELECT public.import_poa_version(
       '55555555-0000-0000-0000-0000000000ee',
       $j$[{"activity_key":"9.99","precio_unitario":50,"frecuencia":1,
            "zonas":[{"group_id":"66666666-0000-0000-0000-000000000001","cantidad_contratada":5}]}]$j$::JSONB,
       '55555555-0000-0000-0000-000000002099'
     ) $$,
  '%pendiente de implementar%',
  'Test 15a: una actividad con zonas falla como se espera (Commit 4 pendiente) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_versions
   WHERE import_operation_id = '55555555-0000-0000-0000-000000002099'),
  0,
  'Test 15b: no queda ninguna poa_version huérfana de la operación que falló ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities WHERE activity_key = '9.99'),
  0,
  'Test 15c: no queda ninguna poa_activities huérfana de la operación que falló (activity_key único de este test) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ee'),
  3,
  'Test 15d: siguen existiendo exactamente las 3 actividades del Test 12 — nada se duplicó ni se perdió ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 16: la idempotencia se conserva tras una inserción real de
-- actividades — reintentar la operación del Test 12 devuelve la misma
-- versión sin duplicar poa_activities.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT public.import_poa_version(
     '55555555-0000-0000-0000-0000000000ee',
     $json$[
       {"activity_key":"1.01","precio_unitario":100.50,"frecuencia":1,"zonas":[]},
       {"activity_key":"1.02","precio_unitario":200.75,"frecuencia":2,"zonas":[]},
       {"activity_key":"1.03","precio_unitario":300.00,"frecuencia":0.5,"zonas":[]}
     ]$json$::JSONB,
     '55555555-0000-0000-0000-000000002001'
   ))::TEXT,
  (SELECT id::TEXT FROM public.poa_versions
   WHERE poa_id = '55555555-0000-0000-0000-0000000000ee'
     AND import_operation_id = '55555555-0000-0000-0000-000000002001'),
  'Test 16a: reintentar la operación del Test 12 devuelve la misma poa_version ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_activities pa
   JOIN public.poa_versions pv ON pv.id = pa.poa_version_id
   WHERE pv.poa_id = '55555555-0000-0000-0000-0000000000ee'),
  3,
  'Test 16b: el reintento no duplicó poa_activities — siguen siendo exactamente 3 ✓'
);

SELECT * FROM finish();
ROLLBACK;
