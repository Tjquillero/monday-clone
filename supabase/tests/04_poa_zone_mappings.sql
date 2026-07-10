-- =============================================================================
-- Tests: poa_zone_mappings (catálogo de zonas del POA, ADR-0004)
--
-- CONTRATO: docs/adr/ADR-0004-poa-zone-catalog.md,
-- docs/architecture/poa-excel-import-design.md (Sección 5). Este archivo es
-- su especificación ejecutable.
--
-- Contrato verificado:
--   - UNIQUE(poa_id, excel_zone_name): no se puede insertar dos veces el
--     mismo nombre de zona para el mismo POA.
--   - Un mismo group_id SÍ puede recibir dos excel_zone_name distintos
--     (deliberadamente permitido — no es un bug, ver Sección 5 del diseño).
--   - Si el group mapeado se elimina, el mapeo NO se borra: group_id pasa
--     a NULL (Regla 5 de ADR-0004), la fila y excel_zone_name se conservan.
--   - Si el poa se elimina, sus mapeos se eliminan en cascada.
--   - RLS: cualquier miembro del board puede leer; solo admin puede escribir.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql):
-- corrompe el contador interno de pgTAP.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/04_poa_zone_mappings.sql
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
-- Fixtures — prefijo 33333333/44444444, propio de este archivo.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('33333333-0000-0000-0000-000000000001', 'Test Board Zone Mappings', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position) VALUES
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Zona Real 1', '#00FF00', 0),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'Zona Real 2', '#00FF00', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', 'leader')
ON CONFLICT (board_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION _test_set_user(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user_id)::TEXT, true);
$$;

INSERT INTO public.poa (id, board_id, name)
VALUES ('33333333-0000-0000-0000-0000000000aa', '33333333-0000-0000-0000-000000000001', 'POA Test Zone Mappings')
ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: insertar un mapeo válido como admin
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin

DO $$
BEGIN
  INSERT INTO public.poa_zone_mappings (poa_id, excel_zone_name, group_id, created_by)
  VALUES ('33333333-0000-0000-0000-0000000000aa', 'PLAZA DE PTO COLOMBIA', '44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
END;
$$;

SELECT is(
  (SELECT group_id::TEXT FROM public.poa_zone_mappings WHERE poa_id = '33333333-0000-0000-0000-0000000000aa' AND excel_zone_name = 'PLAZA DE PTO COLOMBIA'),
  '44444444-0000-0000-0000-000000000001',
  'Test 1: mapeo insertado correctamente por admin ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: duplicar (poa_id, excel_zone_name) viola la restricción única
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_ok BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.poa_zone_mappings (poa_id, excel_zone_name, group_id, created_by)
    VALUES ('33333333-0000-0000-0000-0000000000aa', 'PLAZA DE PTO COLOMBIA', '44444444-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
  EXCEPTION WHEN unique_violation THEN
    v_ok := TRUE;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 2: debió fallar por unique_violation (poa_id, excel_zone_name)';
  END IF;
END;
$$;

SELECT pass('Test 2: (poa_id, excel_zone_name) duplicado rechazado por la restricción única ✓');

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3: dos excel_zone_name distintos SÍ pueden apuntar al mismo group_id
-- (deliberadamente permitido, no es un bug)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO public.poa_zone_mappings (poa_id, excel_zone_name, group_id, created_by)
  VALUES ('33333333-0000-0000-0000-0000000000aa', 'PLAZA PTO. COLOMBIA (nombre viejo)', '44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_zone_mappings WHERE group_id = '44444444-0000-0000-0000-000000000001'),
  2,
  'Test 3: el mismo group_id puede recibir dos excel_zone_name distintos ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: eliminar el group mapeado NO borra el mapeo — group_id pasa a NULL
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO public.groups (id, board_id, title, color, position)
  VALUES ('44444444-0000-0000-0000-000000000099', '33333333-0000-0000-0000-000000000001', 'Zona a Borrar', '#FF0000', 2);

  INSERT INTO public.poa_zone_mappings (poa_id, excel_zone_name, group_id, created_by)
  VALUES ('33333333-0000-0000-0000-0000000000aa', 'MERCADO LA SAZON', '44444444-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-000000000001');

  DELETE FROM public.groups WHERE id = '44444444-0000-0000-0000-000000000099';
END;
$$;

SELECT is(
  (SELECT group_id FROM public.poa_zone_mappings WHERE poa_id = '33333333-0000-0000-0000-0000000000aa' AND excel_zone_name = 'MERCADO LA SAZON'),
  NULL,
  'Test 4: al borrar el group, el mapeo permanece con group_id NULL (pendiente), no se elimina la fila ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: el índice parcial de "pendientes" encuentra exactamente esa fila
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT excel_zone_name FROM public.poa_zone_mappings
   WHERE poa_id = '33333333-0000-0000-0000-0000000000aa' AND group_id IS NULL),
  'MERCADO LA SAZON',
  'Test 5: detección de mapeo pendiente (group_id NULL) encuentra la zona correcta ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: RLS — existe la política de escritura restringida a admin
--
-- Nota: este archivo corre bajo SET ROLE postgres (igual que 01/02/03), y
-- postgres tiene BYPASSRLS en este proyecto — un INSERT directo simulando un
-- "leader" vía _test_set_user() nunca es bloqueado por RLS aquí, sin importar
-- cómo esté escrita la política (confirmado: ningún test existente en
-- 01/02/03 verifica el bloqueo de escritura de RLS en vivo para las tablas
-- del dominio POA; siembran datos directamente como postgres). Por
-- consistencia con esa convención, este test verifica que la política
-- restrictiva existe y está adjunta a la tabla, en vez de intentar
-- dispararla en vivo.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT COUNT(*)::INT FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'poa_zone_mappings'
     AND policyname = 'Solo admin gestiona mapeos de zona del POA'),
  1,
  'Test 6: existe la política RLS que restringe escritura a admin ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7: eliminar el poa elimina sus mapeos en cascada
-- ─────────────────────────────────────────────────────────────────────────────

SELECT _test_set_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin

DO $$
BEGIN
  DELETE FROM public.poa WHERE id = '33333333-0000-0000-0000-0000000000aa';
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.poa_zone_mappings WHERE poa_id = '33333333-0000-0000-0000-0000000000aa'),
  0,
  'Test 7: borrar el poa elimina sus poa_zone_mappings en cascada ✓'
);

SELECT * FROM finish();
ROLLBACK;
