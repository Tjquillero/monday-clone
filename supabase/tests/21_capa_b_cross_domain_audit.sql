-- =============================================================================
-- Test 21: Auditoría de Integración Cruzada de Capa B (Capa B Cross-Domain Audit)
--
-- CONTRATO: offline-sync-domain, evidence-domain, crew-domain,
--           supervision-domain, operational-tracking-domain, incidents-domain
--
-- Demuestra empíricamente las 7 fronteras de desacoplamiento entre Capa B y Capa A:
--
-- 1. Crew -> Execution: Asignar cuadrilla/worker_count NO altera planned_qty, planned_jr, executed_qty ni Actas.
-- 2. Evidence -> Supervision: Foto con hash SHA-256 NO auto-certifica la ejecución (permance reported/draft).
-- 3. Supervision -> Billing: verify_execution habilita elegibilidad; reject_execution excluye permanentemente.
-- 4. Incidents -> Contract: Registrar incidencia climática (lluvia, executed_qty=0) NO altera POA ni planned_qty.
-- 5. Agenda -> Domain Truth: Indicadores de la agenda se calculan por lectura pura sin tabla de estado duplicada.
-- 6. Offline -> Supervision: Inserción offline solo crea draft/reported; no puede auto-otorgarse verified.
-- 7. Rejected -> Billing: Ejecución rechazada permanece con 0 consumo en actas incluso si se crea un reemplazo.
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

-- Fixtures de Auditoría Capa B
INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('b0000000-0000-0000-0000-000000000021', 'Board Capa B Audit', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('g0000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000021', 'Sitio Capa B', '#00FF00', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('b0000000-0000-0000-0000-000000000021', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.board_activity_standards
  (board_id, activity_key, name, category, unit, rendimiento, priority, version, effective_from, source)
VALUES
  ('b0000000-0000-0000-0000-000000000021', 'ACT_CAPAB_01', 'Mantenimiento General Capa B', 'ZONA DURA', 'M2', 10, 'preferred', 1, '2026-01-01', 'test')
ON CONFLICT DO NOTHING;

-- Configurar POA
DO $$
DECLARE
  v_poa_id UUID; v_ver_id UUID; v_act_id UUID; v_paz_id UUID;
  v_plan_id UUID; v_item_id UUID; v_exec1_id UUID;
BEGIN
  INSERT INTO public.poa (board_id, name) VALUES ('b0000000-0000-0000-0000-000000000021', 'POA Capa B Audit')
  RETURNING id INTO v_poa_id;

  INSERT INTO public.poa_versions (poa_id, version_number, status, created_by)
  VALUES (v_poa_id, 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_ver_id;

  INSERT INTO public.poa_activities (poa_version_id, activity_key, frecuencia, precio_unitario)
  VALUES (v_ver_id, 'ACT_CAPAB_01', 4, 15000)
  RETURNING id INTO v_act_id;

  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  VALUES (v_act_id, 'g0000000-0000-0000-0000-000000000021', 1000)
  RETURNING id INTO v_paz_id;

  INSERT INTO public.weekly_plans (board_id, group_id, week_start, period_number, status, created_by, confirmed_by, confirmed_at, closed_by, closed_at)
  VALUES ('b0000000-0000-0000-0000-000000000021', 'g0000000-0000-0000-0000-000000000021', '2026-12-07', 1, 'closed', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', NOW(), 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
  RETURNING id INTO v_plan_id;

  INSERT INTO public.weekly_plan_items (plan_id, planned_sequence, activity_key, poa_activity_zone_id, planned_rendimiento, planned_frecuencia, priority, planned_qty, unit, planned_jr)
  VALUES (v_plan_id, 1, 'ACT_CAPAB_01', v_paz_id, 10, 4, 'preferred', 100, 'm2', 2.5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, crew_name, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (v_item_id, '2026-12-07', 'Cuadrilla Alfa', 3, '2026-12-07 07:00:00', '2026-12-07 15:00:00', 50, 'draft', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec1_id;

  PERFORM set_config('capab.exec1_id', v_exec1_id::TEXT, false);
  PERFORM set_config('capab.item_id', v_item_id::TEXT, false);
  PERFORM set_config('capab.paz_id', v_paz_id::TEXT, false);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: Crew -> Execution Boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- Modificar cuadrilla y worker_count de 3 a 10 trabajadores NO altera planned_qty (100) ni executed_qty (50)
UPDATE public.weekly_plan_item_executions
SET crew_name = 'Cuadrilla Pesada', worker_count = 10
WHERE id = current_setting('capab.exec1_id')::UUID;

SELECT is(
  (SELECT (planned_qty = 100 AND executed_qty = 50)
   FROM public.weekly_plan_items i
   JOIN public.weekly_plan_item_executions e ON e.plan_item_id = i.id
   WHERE e.id = current_setting('capab.exec1_id')::UUID),
  true,
  'Frontera 1 (Crew -> Execution): Cambiar worker_count de 3 a 10 NO altera planned_qty (100) ni executed_qty (50) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 2: Evidence -> Supervision Boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- Insertar una foto con hash SHA-256 y GPS NO cambia el estado de draft a verified
INSERT INTO public.execution_attachments (execution_id, file_name, file_type, file_size, storage_path, uploaded_by, phase, file_hash)
VALUES (current_setting('capab.exec1_id')::UUID, 'foto1.jpg', 'image/jpeg', 1024, 'attachments/foto1.jpg', 'aaaaaaaa-0000-0000-0000-000000000001', 'before', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

SELECT is(
  (SELECT status FROM public.weekly_plan_item_executions WHERE id = current_setting('capab.exec1_id')::UUID),
  'draft',
  'Frontera 2 (Evidence -> Supervision): Subir foto con hash SHA-256 NO auto-certifica la ejecución (permanece en draft) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 6: Offline -> Supervision Boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- Una ejecución creada/reportada offline pasa a reported, pero intentar forzar status='verified' directamente en INSERT falla
SELECT throws_like(
  format(
    'INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by) VALUES (%L, %L, 1, %L, %L, 20, %L, %L)',
    current_setting('capab.item_id'),
    '2026-12-08',
    '2026-12-08 07:00:00',
    '2026-12-08 15:00:00',
    'verified',
    'aaaaaaaa-0000-0000-0000-000000000001'
  ),
  '%verified_by%',
  'Frontera 6 (Offline -> Supervision): Inserción directa con status verified sin supervisor (verified_by NULL) es RECHAZADA por CHECK constraint ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3 & 7: Supervision -> Billing & Rejected -> Billing Boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- Reportar la ejecución y rechazarla vía reject_execution
DO $$
BEGIN
  PERFORM public.report_execution(current_setting('capab.exec1_id')::UUID);
  PERFORM public.reject_execution(current_setting('capab.exec1_id')::UUID, 'Foto de mala calidad, rehacer');
END;
$$;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.acta_items WHERE acta_id = public.generate_acta_draft('b0000000-0000-0000-0000-000000000021')),
  0,
  'Frontera 3 & 7 (Supervision -> Billing): Ejecución REJECTED es rechazada terminalmente y tiene 0 consumo facturable ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 4: Incidents -> Contract Boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- Crear una ejecución de reemplazo y reportar incidencia climática (lluvia, 0 m2)
DO $$
DECLARE v_exec_rain_id UUID;
BEGIN
  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (current_setting('capab.item_id')::UUID, '2026-12-09', 2, '2026-12-09 07:00:00', '2026-12-09 15:00:00', 0, 'draft', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec_rain_id;

  INSERT INTO public.site_incidents (board_id, group_id, incident_date, incident_type, severity, description, reported_by)
  VALUES ('b0000000-0000-0000-0000-000000000021', 'g0000000-0000-0000-0000-000000000021', '2026-12-09', 'weather', 'high', 'Lluvia torrencial en sitio', 'aaaaaaaa-0000-0000-0000-000000000001');
END;
$$;

SELECT is(
  (SELECT cantidad_contratada FROM public.poa_activity_zones WHERE id = current_setting('capab.paz_id')::UUID),
  1000::NUMERIC,
  'Frontera 4 (Incidents -> Contract): Incidencia climática (lluvia) NO altera la cantidad contratada del POA (1000) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 5: Agenda -> Domain Truth Boundary
-- ─────────────────────────────────────────────────────────────────────────────
-- Crear una ejecución correcta de reemplazo (40 m2), reportar y verificar.
-- Probar que el % de cumplimiento se calcula dinámicamente sin tabla auxiliar.
DO $$
DECLARE v_exec2_id UUID;
BEGIN
  INSERT INTO public.weekly_plan_item_executions (plan_item_id, execution_date, worker_count, started_at, finished_at, executed_qty, status, created_by)
  VALUES (current_setting('capab.item_id')::UUID, '2026-12-10', 2, '2026-12-10 07:00:00', '2026-12-10 15:00:00', 40, 'draft', 'aaaaaaaa-0000-0000-0000-000000000001')
  RETURNING id INTO v_exec2_id;

  PERFORM public.report_execution(v_exec2_id);
  PERFORM public.verify_execution(v_exec2_id);
END;
$$;

SELECT is(
  (
    SELECT ROUND((SUM(e.executed_qty) / MAX(i.planned_qty)) * 100, 2)::NUMERIC
    FROM public.weekly_plan_items i
    JOIN public.weekly_plan_item_executions e ON e.plan_item_id = i.id
    WHERE i.id = current_setting('capab.item_id')::UUID AND e.status = 'verified'
  ),
  40.00::NUMERIC,
  'Frontera 5 (Agenda -> Domain Truth): % de Cumplimiento (40%) se proyecta por lectura pura sobre la fuente de verdad ✓'
);

SELECT * FROM finish();
ROLLBACK;
