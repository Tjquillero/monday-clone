-- =============================================================================
-- Tests: RLS de actas / acta_items / acta_item_sources.
--
-- CONTRATO: supabase/migrations/20260731_acta_billing_rls.sql
-- Ref: docs/architecture/acta-billing-design.md, secciones "RLS" y
--      "Dependencia arquitectónica".
--
-- Esto protege un CONTRATO DE SUBSISTEMA, no un detalle de PostgreSQL:
--   "Las funciones oficiales de dominio (generate_acta_draft(), issue_acta())
--    deben seguir siendo capaces de escribir en el subsistema Acta cuando un
--    usuario authenticated no tiene permiso directo de escritura sobre las
--    tablas."
-- Se prueba el COMPORTAMIENTO bajo el rol authenticated real (sin
-- BYPASSRLS), no solo metadata de pg_proc/pg_class — si mañana cambia el
-- mecanismo interno (ownership, cómo se otorga el bypass), este test sigue
-- siendo la definición de "sigue funcionando".
--
-- Incluye controles negativos (INSERT/UPDATE directos denegados) — sin
-- ellos, un test que solo comprueba que las funciones "siguen funcionando"
-- no distingue entre RLS realmente activo y RLS que nunca llegó a aplicarse.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/10_acta_billing_rls.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres; -- BYPASSRLS, para los fixtures del test

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(10);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures propios de este archivo (prefijo facade01).
-- admin = aaaaaaaa-...-000000000001 (miembro admin del board).
-- viewer = aaaaaaaa-...-000000000005 (NO es miembro de este board).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('facade01-0000-0000-0000-000000000001', 'Test Board RLS Acta', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('facade01-0000-0000-0000-000000000002', 'facade01-0000-0000-0000-000000000001', 'Sitio RLS Acta', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('facade01-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('facade01-0000-0000-0000-000000000001', 'RLS_ACTA_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
        v_plan_id UUID; v_item_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('facade01-0000-0000-0000-000000000001', 'POA Test RLS Acta')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, 'RLS_ACTA_001', 4, 1000)
  ON CONFLICT (poa_version_id, activity_key) DO UPDATE SET precio_unitario = EXCLUDED.precio_unitario
  RETURNING id INTO v_activity_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, 'facade01-0000-0000-0000-000000000002', 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada
  RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('facade01-0000-0000-0000-000000000001', 'facade01-0000-0000-0000-000000000002',
          '2026-11-16', 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'RLS_ACTA_001', v_paz_id, 10, 4, 'preferred', 100, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-11-16', 2, '2026-11-16 07:00:00', '2026-11-16 15:00:00',
          100, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-17 10:00:00', 'aaaaaaaa-0000-0000-0000-000000000001');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrato de subsistema: las funciones de dominio siguen escribiendo bajo
-- el rol authenticated real, sin BYPASSRLS.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;

DO $$
DECLARE v_acta_id UUID;
BEGIN
  v_acta_id := public.generate_acta_draft('facade01-0000-0000-0000-000000000001');
  PERFORM set_config('rls_acta_test.acta_id', v_acta_id::TEXT, false);
END;
$$;

SELECT ok(
  current_setting('rls_acta_test.acta_id', true) IS NOT NULL,
  'Test 1: generate_acta_draft(), invocada como authenticated (admin), sigue funcionando bajo RLS ✓'
);

-- Test 2: el admin (miembro) puede VER el acta que acaba de crear.
SELECT is(
  (SELECT COUNT(*)::INT FROM public.actas WHERE id = current_setting('rls_acta_test.acta_id')::UUID),
  1,
  'Test 2: un miembro del board (admin) ve el acta vía RLS ✓'
);

-- Test 3: un no-miembro (viewer) NO ve el acta — cambia el JWT sin salir de authenticated.
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT is(
  (SELECT COUNT(*)::INT FROM public.actas WHERE id = current_setting('rls_acta_test.acta_id')::UUID),
  0,
  'Test 3: un usuario que NO es miembro del board no ve el acta vía RLS ✓'
);

-- Vuelve al admin para el resto de los tests.
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- Test 4 (control negativo): un INSERT directo a actas, como authenticated,
-- es rechazado — confirma que la ausencia de política de escritura
-- realmente deniega, no que RLS nunca llegó a aplicarse.
SELECT throws_like(
  $$ INSERT INTO public.actas (board_id, generated_by)
     VALUES ('facade01-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '%row-level security%',
  'Test 4: un INSERT directo a actas (sin pasar por la función) es rechazado por RLS ✓'
);

-- Test 5 (control negativo): un UPDATE directo a actas, como authenticated,
-- no tiene efecto (sin política de escritura, la fila no es visible para
-- UPDATE) — se verifica leyendo el valor después, no con throws_like,
-- porque UPDATE sin política aplicable no lanza excepción: simplemente no
-- encuentra filas que actualizar.
UPDATE public.actas SET observaciones = 'intento directo bajo RLS'
WHERE id = current_setting('rls_acta_test.acta_id')::UUID;

SELECT is(
  (SELECT observaciones FROM public.actas WHERE id = current_setting('rls_acta_test.acta_id')::UUID),
  NULL,
  'Test 5: un UPDATE directo a actas (sin pasar por la función) no tiene efecto bajo RLS ✓'
);

-- Test 6: issue_acta(), invocada como authenticated (admin), sigue
-- funcionando bajo RLS — completa el contrato de subsistema para AMBAS
-- funciones de dominio.
DO $$
DECLARE v_result UUID;
BEGIN
  v_result := public.issue_acta(current_setting('rls_acta_test.acta_id')::UUID);
END;
$$;

SELECT is(
  (SELECT estado FROM public.actas WHERE id = current_setting('rls_acta_test.acta_id')::UUID),
  'issued',
  'Test 6: issue_acta(), invocada como authenticated (admin), sigue funcionando bajo RLS ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 7-10: acta_items / acta_item_sources heredan el mismo alcance de
-- lectura (vía acta_id -> actas.board_id).
-- ─────────────────────────────────────────────────────────────────────────────

SELECT ok(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = current_setting('rls_acta_test.acta_id')::UUID) > 0,
  'Test 7: el admin (miembro) ve las líneas (acta_items) del acta ✓'
);

SELECT ok(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources ais
   JOIN public.acta_items ai ON ai.id = ais.acta_item_id
   WHERE ai.acta_id = current_setting('rls_acta_test.acta_id')::UUID) > 0,
  'Test 8: el admin (miembro) ve las fuentes (acta_item_sources) del acta ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = current_setting('rls_acta_test.acta_id')::UUID),
  0,
  'Test 9: un no-miembro no ve las líneas (acta_items) del acta ✓'
);

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_item_sources ais
   JOIN public.acta_items ai ON ai.id = ais.acta_item_id
   WHERE ai.acta_id = current_setting('rls_acta_test.acta_id')::UUID),
  0,
  'Test 10: un no-miembro no ve las fuentes (acta_item_sources) del acta ✓'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
