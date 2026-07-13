-- =============================================================================
-- Tests: get_board_summary() (IA)
--
-- CONTRATO: supabase/migrations/20260805_ai_board_summary.sql
--
-- Cubre: cálculo correcto de contractedValue/certifiedValue/contractProgress,
-- conteo de actas draft/issued, delegación (no duplicación) a
-- get_pending_billable_work(), comportamiento con board sin POA activo, y
-- autorización.
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/15_ai_board_summary.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(10);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo 60ab5000 / 5ca1ab1e). Una actividad contratada en 100000
-- unidades a 1000 -> contractedValue = 100.000.000. Se certifican 40 unidades
-- (verified + closed) -> certifiedValue = 40.000. contractProgress = 0.04%.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('60ab5000-0000-0000-0000-000000000001', 'Test Board Summary', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000000501', '60ab5000-0000-0000-0000-000000000001', 'Sitio Summary', '#FF00FF', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('60ab5000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;
INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('60ab5000-0000-0000-0000-000000000001', 'BS_001', 'Poda de árboles', 'ZONA VERDE', 'UND', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_poa_id UUID; v_version_id UUID; v_activity_id UUID; v_paz_id UUID;
        v_plan_id UUID; v_item_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('60ab5000-0000-0000-0000-000000000001', 'POA Test Summary')
  RETURNING id INTO v_poa_id;
  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 3, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_version_id;
  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_version_id, 'BS_001', 4, 1000)
  RETURNING id INTO v_activity_id;
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_activity_id, '5ca1ab1e-0000-0000-0000-000000000501', 100000)
  RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('60ab5000-0000-0000-0000-000000000001', '5ca1ab1e-0000-0000-0000-000000000501',
          '2026-12-07', 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_id;
  INSERT INTO public.weekly_plan_items
    (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento,
     planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'BS_001', v_paz_id, 10, 4, 'preferred', 40, 'und', 2.5)
  RETURNING id INTO v_item_id;
  INSERT INTO public.weekly_plan_item_executions
    (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, verified_by, verified_at, created_by)
  VALUES (v_item_id, '2026-12-07', 2, '2026-12-07 07:00:00', '2026-12-07 15:00:00',
          40, 'verified', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-12-08 09:00:00', 'aaaaaaaa-0000-0000-0000-000000000001');
END;
$$;

SELECT is(
  (SELECT board_name FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  'Test Board Summary',
  'Test 1: board_name correcto ✓'
);
SELECT is(
  (SELECT active_poa_version FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  3,
  'Test 2: active_poa_version usa version_number real (3), no un texto inventado ✓'
);
SELECT is(
  (SELECT contracted_value FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  100000000::NUMERIC, -- 100000 * 1000
  'Test 3: contracted_value = precio_unitario * cantidad_contratada de la versión activa ✓'
);
SELECT is(
  (SELECT certified_value FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  40000::NUMERIC, -- 40 * 1000
  'Test 4: certified_value = SUM(executed_qty * precio_unitario) de ejecuciones verified+closed ✓'
);
SELECT is(
  (SELECT contract_progress FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  0.0::NUMERIC, -- 40000/100000000*100 = 0.04, redondeado a 1 decimal = 0.0
  'Test 5: contract_progress = certified/contracted * 100, redondeado a 1 decimal ✓'
);
SELECT is(
  (SELECT draft_actas FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  0,
  'Test 6: draft_actas = 0 (todavía no se generó ningún borrador) ✓'
);

-- Genera y emite un acta — draft_actas debe volver a 0, issued_actas a 1,
-- y pending_billable_value debe reflejar exactamente lo que ya reporta
-- get_pending_billable_work() (delegado, no recalculado aquí).
DO $$
DECLARE v_acta_id UUID;
BEGIN
  v_acta_id := public.generate_acta_draft('60ab5000-0000-0000-0000-000000000001');
  PERFORM public.issue_acta(v_acta_id);
END;
$$;

SELECT is(
  (SELECT issued_actas FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  1,
  'Test 7: issued_actas = 1 tras emitir ✓'
);
SELECT is(
  (SELECT pending_billable_value FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001')),
  (SELECT estimated_value FROM public.get_pending_billable_work('60ab5000-0000-0000-0000-000000000001')),
  'Test 8: pending_billable_value coincide EXACTAMENTE con get_pending_billable_work() — delegado, no recalculado ✓'
);

-- Board sin POA activo: contractedValue/certifiedValue/progress en 0, sin error.
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('60ab5000-0000-0000-0000-000000000002', 'Test Board Summary No POA', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('60ab5000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

SELECT is(
  (SELECT active_poa_version FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000002')),
  NULL::INT,
  'Test 9: un board sin POA activo devuelve active_poa_version = NULL, sin error ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_board_summary('60ab5000-0000-0000-0000-000000000001') $$,
  '%No tiene acceso%',
  'Test 10: un no-miembro no puede leer get_board_summary() ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT * FROM finish();
ROLLBACK;
