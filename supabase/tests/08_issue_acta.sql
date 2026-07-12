-- =============================================================================
-- Tests: issue_acta() (Incremento 5, Commit 3/N)
--
-- CONTRATO: supabase/migrations/20260729_issue_acta.sql
-- Ref: docs/adr/ADR-0003-billing-source.md ("Mecanismo de emisión del Acta").
--
-- Cubre exactamente lo que el contrato promete — autorización (solo admin),
-- numeración segura (lock de boards + MAX+1, offset configurable), rechazo
-- de re-emisión y de borradores vacíos, y la inmutabilidad estructural
-- post-emisión en las 3 tablas (actas / acta_items / acta_item_sources).
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/08_issue_acta.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(14);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures propios de este archivo (prefijo e1551e00 / 5ca1ab1e).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _test_seed_poa_activity_08(
  p_board_id UUID, p_activity_key TEXT, p_precio_unitario NUMERIC DEFAULT 1000
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES (p_board_id, 'POA Test Issue Acta')
  ON CONFLICT (board_id) DO UPDATE SET name = EXCLUDED.name RETURNING id INTO v_poa_id;

  SELECT id INTO v_version_id FROM public.poa_versions WHERE poa_id = v_poa_id AND status = 'active';
  IF v_version_id IS NULL THEN
    INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
    VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
    RETURNING id INTO v_version_id;
  END IF;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, p_activity_key, 4, p_precio_unitario)
  ON CONFLICT (poa_version_id, activity_key) DO UPDATE SET precio_unitario = EXCLUDED.precio_unitario
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION _test_seed_closed_execution_08(
  p_board_id UUID, p_group_id UUID, p_activity_key TEXT, p_week_start DATE,
  p_executed_qty NUMERIC, p_verified_at TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_activity_id UUID; v_paz_id UUID; v_plan_id UUID; v_item_id UUID; v_exec_id UUID;
BEGIN
  v_activity_id := _test_seed_poa_activity_08(p_board_id, p_activity_key);

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, p_group_id, 100000)
  ON CONFLICT (poa_activity_id, zone_id) DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada
  RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES (p_board_id, p_group_id,
          p_week_start, 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, p_activity_key, v_paz_id, 10, 4, 'preferred', p_executed_qty, 'und', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, p_week_start, 2, (p_week_start::TEXT || ' 07:00:00')::TIMESTAMPTZ, (p_week_start::TEXT || ' 15:00:00')::TIMESTAMPTZ,
          p_executed_qty, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', p_verified_at, 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_id;

  RETURN v_exec_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Board A: flujo principal — autorización, emisión, re-emisión, inmutabilidad.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('e1551e00-0000-0000-0000-000000000001', 'Test Board Issue Acta A', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000101', 'e1551e00-0000-0000-0000-000000000001', 'Sitio Issue Acta A', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role) VALUES
  ('e1551e00-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('e1551e00-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'assistant')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('e1551e00-0000-0000-0000-000000000001', 'ISS_ACTA_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_exec_id UUID; v_acta_id UUID;
BEGIN
  v_exec_id := _test_seed_closed_execution_08(
    'e1551e00-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000101',
    'ISS_ACTA_001', '2026-11-02', 100, '2026-11-03 10:00:00'
  );
  v_acta_id := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000001');
  PERFORM set_config('iss_acta_test.acta_id', v_acta_id::TEXT, false);
END;
$$;

-- Test 1: un no-admin (assistant) no puede emitir.
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', false);
SELECT throws_like(
  format('SELECT public.issue_acta(%L)', current_setting('iss_acta_test.acta_id')),
  '%administradores%',
  'Test 1: un no-admin no puede emitir el acta ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);

-- Test 2-4: el admin emite correctamente.
DO $$
DECLARE v_result UUID;
BEGIN
  v_result := public.issue_acta(current_setting('iss_acta_test.acta_id')::UUID);
END;
$$;

SELECT is(
  (SELECT estado FROM public.actas WHERE id = current_setting('iss_acta_test.acta_id')::UUID),
  'issued',
  'Test 2: issue_acta cambia el estado a issued ✓'
);
SELECT is(
  (SELECT numero FROM public.actas WHERE id = current_setting('iss_acta_test.acta_id')::UUID),
  1,
  'Test 3: sin offset configurado, el primer acta del board recibe numero=1 ✓'
);
SELECT ok(
  (SELECT issued_by = 'aaaaaaaa-0000-0000-0000-000000000001'::UUID AND issued_at IS NOT NULL
   FROM public.actas WHERE id = current_setting('iss_acta_test.acta_id')::UUID),
  'Test 4: issued_by e issued_at quedan registrados ✓'
);

-- Test 5: re-emitir la misma acta falla explícito (ya no está en draft).
SELECT throws_like(
  format('SELECT public.issue_acta(%L)', current_setting('iss_acta_test.acta_id')),
  '%no está en estado draft%',
  'Test 5: re-emitir un acta ya issued falla explícito, sin reasignar numero ✓'
);

-- Test 6-9: inmutabilidad estructural — actas / acta_items / acta_item_sources.
SELECT throws_like(
  format('UPDATE public.actas SET observaciones = %L WHERE id = %L', 'intento post-emisión', current_setting('iss_acta_test.acta_id')),
  '%inmutable%',
  'Test 6: UPDATE sobre un acta issued (incluso observaciones) es rechazado ✓'
);
SELECT throws_like(
  format('DELETE FROM public.actas WHERE id = %L', current_setting('iss_acta_test.acta_id')),
  '%inmutable%',
  'Test 7: DELETE de un acta issued es rechazado ✓'
);
SELECT throws_like(
  format(
    'UPDATE public.acta_items SET cantidad_facturada = 1 WHERE acta_id = %L',
    current_setting('iss_acta_test.acta_id')
  ),
  '%inmutable%',
  'Test 8: UPDATE de una línea (acta_items) de un acta issued es rechazado ✓'
);
SELECT throws_like(
  format(
    'DELETE FROM public.acta_item_sources WHERE acta_item_id IN (SELECT id FROM public.acta_items WHERE acta_id = %L)',
    current_setting('iss_acta_test.acta_id')
  ),
  '%inmutable%',
  'Test 9: DELETE de una fuente (acta_item_sources) de un acta issued es rechazado ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Board B: numeración inicial configurable (offset).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at, acta_numero_inicial)
VALUES ('e1551e00-0000-0000-0000-000000000002', 'Test Board Issue Acta B', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 38)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000102', 'e1551e00-0000-0000-0000-000000000002', 'Sitio Issue Acta B', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('e1551e00-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES ('e1551e00-0000-0000-0000-000000000002', 'ISS_ACTA_002', 'Corte de grama', 'ZONA VERDE', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_acta_id_b1 UUID;
BEGIN
  PERFORM _test_seed_closed_execution_08(
    'e1551e00-0000-0000-0000-000000000002', '5ca1ab1e-0000-0000-0000-000000000102',
    'ISS_ACTA_002', '2026-11-02', 50, '2026-11-03 10:00:00'
  );
  v_acta_id_b1 := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000002');
  PERFORM public.issue_acta(v_acta_id_b1);
  PERFORM set_config('iss_acta_test.acta_id_b1', v_acta_id_b1::TEXT, false);
END;
$$;

SELECT is(
  (SELECT numero FROM public.actas WHERE id = current_setting('iss_acta_test.acta_id_b1')::UUID),
  38,
  'Test 10: con acta_numero_inicial=38, la primera emisión del board recibe numero=38 ✓'
);

DO $$
DECLARE v_acta_id_b2 UUID;
BEGIN
  PERFORM _test_seed_closed_execution_08(
    'e1551e00-0000-0000-0000-000000000002', '5ca1ab1e-0000-0000-0000-000000000102',
    'ISS_ACTA_002', '2026-11-09', 20, '2026-11-10 10:00:00'
  );
  v_acta_id_b2 := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000002');
  PERFORM public.issue_acta(v_acta_id_b2);
  PERFORM set_config('iss_acta_test.acta_id_b2', v_acta_id_b2::TEXT, false);
END;
$$;

SELECT is(
  (SELECT numero FROM public.actas WHERE id = current_setting('iss_acta_test.acta_id_b2')::UUID),
  39,
  'Test 11: la segunda emisión sigue MAX(numero)+1 = 39 — el offset ya no domina ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Board C: borrador vacío se rechaza.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('e1551e00-0000-0000-0000-000000000003', 'Test Board Issue Acta C', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('e1551e00-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

DO $$
DECLARE v_acta_id_c UUID;
BEGIN
  -- Sin ejecuciones elegibles: generate_acta_draft crea un borrador SIN líneas.
  v_acta_id_c := public.generate_acta_draft('e1551e00-0000-0000-0000-000000000003');
  PERFORM set_config('iss_acta_test.acta_id_c', v_acta_id_c::TEXT, false);
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = current_setting('iss_acta_test.acta_id_c')::UUID),
  0,
  'Test 12: fixture — el borrador del board C efectivamente no tiene líneas ✓'
);

SELECT throws_like(
  format('SELECT public.issue_acta(%L)', current_setting('iss_acta_test.acta_id_c')),
  '%sin líneas facturables%',
  'Test 13: emitir un borrador sin líneas facturables es rechazado ✓'
);

-- Test 14: el rechazo no dejó el acta en un estado inconsistente — sigue draft.
SELECT is(
  (SELECT estado FROM public.actas WHERE id = current_setting('iss_acta_test.acta_id_c')::UUID),
  'draft',
  'Test 14: tras el rechazo, el acta vacía sigue en draft (sin numero ni issued_at) ✓'
);

SELECT * FROM finish();
ROLLBACK;
