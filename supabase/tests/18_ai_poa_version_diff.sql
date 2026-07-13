-- =============================================================================
-- Tests: get_poa_version_diff() (IA)
--
-- CONTRATO: supabase/migrations/20260809_ai_poa_version_diff.sql
--
-- Cubre: actividad+zona agregada, actividad+zona eliminada, cambio de
-- cantidad (misma actividad+zona en ambas versiones), cambio de precio
-- (misma actividad, a nivel activity_key, no por zona), una actividad sin
-- ningún cambio NO aparece en el diff, mismo-version rechazado, versión
-- inexistente rechazada, autorización.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/18_ai_poa_version_diff.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(13);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo ...0018 / ...1801-1802).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('de1a0000-0000-0000-0000-000000000018', 'Test Board POA Diff', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000001801', 'de1a0000-0000-0000-0000-000000000018', 'Zona A', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000001802', 'de1a0000-0000-0000-0000-000000000018', 'Zona B', '#00FF00', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('de1a0000-0000-0000-0000-000000000018', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

DO $$
DECLARE
  v_poa_id UUID;
  v_v1 UUID; v_v2 UUID;
  v_act UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('de1a0000-0000-0000-0000-000000000018', 'POA Test Diff')
  RETURNING id INTO v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001') RETURNING id INTO v_v1;
  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 2, 'active', 'aaaaaaaa-0000-0000-0000-000000000001') RETURNING id INTO v_v2;

  -- PV_001: presente en ambas versiones, misma zona (A) — cantidad Y precio
  -- cambian -> debe producir una fila quantity_changed y una price_changed.
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1, 'PV_001', 4, 1000) RETURNING id INTO v_act;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act, '5ca1ab1e-0000-0000-0000-000000001801', 100);

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v2, 'PV_001', 4, 1200) RETURNING id INTO v_act;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act, '5ca1ab1e-0000-0000-0000-000000001801', 150);

  -- PV_002: solo en v1 (zona A) -> "removed".
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1, 'PV_002', 4, 500) RETURNING id INTO v_act;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act, '5ca1ab1e-0000-0000-0000-000000001801', 50);

  -- PV_003: solo en v2 (zona B) -> "added".
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v2, 'PV_003', 4, 700) RETURNING id INTO v_act;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act, '5ca1ab1e-0000-0000-0000-000000001802', 80);

  -- PV_004: idéntica en ambas versiones (misma zona, cantidad y precio) ->
  -- NO debe aparecer en ningún tipo de fila del diff.
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v1, 'PV_004', 4, 300) RETURNING id INTO v_act;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act, '5ca1ab1e-0000-0000-0000-000000001801', 20);
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_v2, 'PV_004', 4, 300) RETURNING id INTO v_act;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act, '5ca1ab1e-0000-0000-0000-000000001801', 20);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tests
-- ─────────────────────────────────────────────────────────────────────────────

-- get_poa_version_diff toma poa_id, no board_id — se resuelve primero.
SELECT set_config('pvd_test.poa_id',
  (SELECT id::TEXT FROM public.poa WHERE board_id = 'de1a0000-0000-0000-0000-000000000018'), false);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2)),
  4,
  'Test 1: 4 filas totales (1 added + 1 removed + 1 quantity_changed + 1 price_changed) ✓'
);

SELECT is(
  (SELECT activity_key FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'added'),
  'PV_003',
  'Test 2: added = PV_003 (solo existe en v2) ✓'
);
SELECT is(
  (SELECT zone_name FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'added'),
  'Zona B',
  'Test 3: added.zone_name = Zona B ✓'
);

SELECT is(
  (SELECT activity_key FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'removed'),
  'PV_002',
  'Test 4: removed = PV_002 (solo existía en v1) ✓'
);
SELECT is(
  (SELECT zone_name FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'removed'),
  'Zona A',
  'Test 5: removed.zone_name = Zona A ✓'
);

SELECT is(
  (SELECT activity_key FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'quantity_changed'),
  'PV_001',
  'Test 6: quantity_changed = PV_001 ✓'
);
SELECT is(
  (SELECT ROW(old_quantity, new_quantity) FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'quantity_changed'),
  ROW(100::NUMERIC, 150::NUMERIC),
  'Test 7: quantity_changed old=100 new=150 ✓'
);

SELECT is(
  (SELECT activity_key FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'price_changed'),
  'PV_001',
  'Test 8: price_changed = PV_001 (mismo activity_key, no por zona) ✓'
);
SELECT is(
  (SELECT ROW(old_price, new_price) FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE change_type = 'price_changed'),
  ROW(1000::NUMERIC, 1200::NUMERIC),
  'Test 9: price_changed old=1000 new=1200 — reportado como hecho normal, no anomalía (poa-domain.md Regla 9) ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) WHERE activity_key = 'PV_004'),
  0,
  'Test 10: PV_004 (sin ningún cambio) no aparece en ninguna fila del diff ✓'
);

SELECT throws_like(
  $$ SELECT * FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 1) $$,
  '%deben ser distintos%',
  'Test 11: comparar una versión contra sí misma se rechaza ✓'
);
SELECT throws_like(
  $$ SELECT * FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 99) $$,
  '%no existen%',
  'Test 12: una versión inexistente se rechaza ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_poa_version_diff(current_setting('pvd_test.poa_id')::UUID, 1, 2) $$,
  '%No tiene acceso%',
  'Test 13: un no-miembro no puede leer get_poa_version_diff() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
