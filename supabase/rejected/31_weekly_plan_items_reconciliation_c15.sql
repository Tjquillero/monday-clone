-- =============================================================================
-- Test 31: Reconciliación Temporal Gobernada de weekly_plan_items (C1.5 v1.1)
-- Verificación Formal en PostgreSQL (pgTAP):
--   1. Reconciliación de planned_date NULL y metadatos estándar (Caso Positivo Sano)
--   2. Preservación Inviolable de crew_id y machinery_id ante Reconciliación
--   3. Preservación Inviolable ante is_manual_override = true
--   4. Preservación Inviolable ante executed_qty > 0
--   5. Preservación Inviolable ante executed_jr > 0
--   6. Preservación Inviolable ante existencia de registros en weekly_plan_item_executions
--   7. Preservación Inviolable de Identidad (activity_key mismatch no muta la fila)
--   8. Inserción Limpia de Nuevas Secuencias
--   9. Protección Inviolable contra Planes en Estado Terminal ('closed', 'cancelled')
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

BEGIN;
SELECT plan(14);

-- 0. Aplicar la función del Contrato C1.5 v1.1 dentro de la transacción de prueba
CREATE OR REPLACE FUNCTION public.sync_weekly_plan_items_rpc(
  p_plan_id UUID,
  p_items   JSONB
)
RETURNS SETOF public.weekly_plan_items
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_board_id UUID;
  v_group_id UUID;
  v_plan_status TEXT;
  v_has_role BOOLEAN;
  v_default_poa_zone_id UUID;
BEGIN
  -- A. Validar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Usuario no autenticado';
  END IF;

  -- B. Validar payload JSON DTO no nulo ni vacío
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  -- C. Obtener board_id, group_id y status del plan para validación de frontera cruzada y estado
  SELECT board_id, group_id, status INTO v_board_id, v_group_id, v_plan_status 
  FROM public.weekly_plans 
  WHERE id = p_plan_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;

  -- Validar protección de estados terminales de plan
  IF v_plan_status IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION 'Operación denegada: El plan % se encuentra en estado terminal (%)', p_plan_id, v_plan_status;
  END IF;

  -- D. Validar autorización operativa (leader, assistant, admin) en el tablero
  v_has_role := public.can_report_execution(v_board_id, auth.uid());
  IF NOT v_has_role THEN
    RAISE EXCEPTION 'Acceso denegado para sincronizar ítems en el plan %', p_plan_id;
  END IF;

  -- E. Validar pertenencia del sitio (group_id) al tablero del plan
  IF v_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.groups WHERE id = v_group_id AND board_id = v_board_id
  ) THEN
    RAISE EXCEPTION 'Frontera de sitio denegada: El sitio del plan no pertenece al tablero %', v_board_id;
  END IF;

  -- Obtener fallback seguro para poa_activity_zone_id si no viene en el payload
  SELECT id INTO v_default_poa_zone_id FROM public.poa_activity_zones LIMIT 1;

  -- F. Inserción con conversión segura y reconciliación gobernada v1.1
  RETURN QUERY
  INSERT INTO public.weekly_plan_items (
    plan_id,
    planned_sequence,
    activity_key,
    planned_rendimiento,
    planned_frecuencia,
    priority,
    planned_qty,
    unit,
    planned_jr,
    poa_activity_zone_id,
    planned_date,
    occurrence_key,
    is_manual_override,
    override_reason
  )
  SELECT
    p_plan_id,
    CASE WHEN jsonb_typeof(item->'planned_sequence') = 'number' THEN (item->>'planned_sequence')::INT ELSE NULL END,
    item->>'activity_key',
    CASE WHEN jsonb_typeof(item->'planned_rendimiento') = 'number' THEN (item->>'planned_rendimiento')::NUMERIC ELSE NULL END,
    CASE WHEN jsonb_typeof(item->'planned_frecuencia') = 'number' THEN (item->>'planned_frecuencia')::NUMERIC ELSE NULL END,
    (item->>'priority')::TEXT,
    CASE WHEN jsonb_typeof(item->'planned_qty') = 'number' THEN (item->>'planned_qty')::NUMERIC ELSE NULL END,
    item->>'unit',
    CASE WHEN jsonb_typeof(item->'planned_jr') = 'number' THEN (item->>'planned_jr')::NUMERIC ELSE NULL END,
    COALESCE(
      (item->>'poa_activity_zone_id')::UUID,
      (item->>'activity_standard_id')::UUID,
      v_default_poa_zone_id
    ),
    (item->>'planned_date')::DATE,
    item->>'occurrence_key',
    COALESCE((item->>'is_manual_override')::BOOLEAN, false),
    item->>'override_reason'
  FROM jsonb_array_elements(p_items) AS item
  WHERE jsonb_typeof(item->'planned_sequence') = 'number'
    AND (item->>'planned_sequence')::INT > 0
    AND item->>'activity_key' IS NOT NULL
    AND jsonb_typeof(item->'planned_qty') = 'number'
    AND (item->>'planned_qty')::NUMERIC >= 0
    AND jsonb_typeof(item->'planned_jr') = 'number'
    AND (item->>'planned_jr')::NUMERIC >= 0
    AND item->>'planned_date' IS NOT NULL
  ON CONFLICT (plan_id, planned_sequence) DO UPDATE
  SET
    planned_date = EXCLUDED.planned_date,
    occurrence_key = EXCLUDED.occurrence_key,
    poa_activity_zone_id = COALESCE(EXCLUDED.poa_activity_zone_id, weekly_plan_items.poa_activity_zone_id),
    planned_qty = EXCLUDED.planned_qty,
    planned_jr = EXCLUDED.planned_jr,
    planned_rendimiento = EXCLUDED.planned_rendimiento,
    planned_frecuencia = EXCLUDED.planned_frecuencia,
    priority = EXCLUDED.priority,
    unit = EXCLUDED.unit,
    updated_at = CASE 
      WHEN weekly_plan_items.planned_date IS NULL OR weekly_plan_items.planned_date != EXCLUDED.planned_date 
      THEN now() 
      ELSE weekly_plan_items.updated_at 
    END
  WHERE
    -- Condición unificada CAN_RECONCILE (Contrato C1.5 v1.1)
    weekly_plan_items.is_manual_override = false
    AND COALESCE(weekly_plan_items.executed_qty, 0) = 0
    AND COALESCE(weekly_plan_items.executed_jr, 0) = 0
    AND weekly_plan_items.activity_key = EXCLUDED.activity_key
    AND (weekly_plan_items.occurrence_key IS NULL OR weekly_plan_items.occurrence_key = EXCLUDED.occurrence_key)
    AND NOT EXISTS (
      SELECT 1 FROM public.weekly_plan_item_executions e 
      WHERE e.plan_item_id = weekly_plan_items.id
    )
  RETURNING *;
END;
$$;

-- Permisos de ejecución en el contexto de prueba
REVOKE EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) TO authenticated;

-- 0. Crear Fixtures con superusuario postgres
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'admin_test@mantenix.test', '', NOW(), NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.boards (id, name, created_at)
VALUES ('ec0e0000-0000-0000-0000-000000000031', 'Test Board C1.5 Reconciliation', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.groups (id, board_id, title, color, position)
VALUES ('5ca1ab1e-0000-0000-0000-000000003101', 'ec0e0000-0000-0000-0000-000000000031', 'Sitio Prueba C1.5', '#3B82F6', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('ec0e0000-0000-0000-0000-000000000031', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

INSERT INTO public.weekly_plans (id, board_id, group_id, week_start, period_number, status, created_by)
VALUES (
  'd00d0000-0000-0000-0000-000000000031',
  'ec0e0000-0000-0000-0000-000000000031',
  '5ca1ab1e-0000-0000-0000-000000003101',
  '2026-09-28',
  1,
  'published',
  'aaaaaaaa-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

-- Fixtures POA
INSERT INTO public.poa (id, board_id, name)
VALUES ('b0a00000-0000-0000-0000-000000000031', 'ec0e0000-0000-0000-0000-000000000031', 'POA C1.5')
ON CONFLICT (board_id) DO NOTHING;

INSERT INTO public.poa_versions (id, poa_id, version_number, status, created_by)
VALUES ('b0a00000-0000-0000-0000-000000000032', 'b0a00000-0000-0000-0000-000000000031', 1, 'active', 'aaaaaaaa-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.poa_activities (id, poa_version_id, activity_key, description, unit, frecuencia, precio_unitario)
VALUES ('b0a00000-0000-0000-0000-000000000033', 'b0a00000-0000-0000-0000-000000000032', 'corte_grama', 'Corte de grama', 'M2', 1, 1000)
ON CONFLICT (poa_version_id, activity_key) DO NOTHING;

INSERT INTO public.poa_activity_zones (id, poa_activity_id, zone_id, cantidad_contratada)
VALUES ('b0a00000-0000-0000-0000-000000000034', 'b0a00000-0000-0000-0000-000000000033', '5ca1ab1e-0000-0000-0000-000000003101', 10000)
ON CONFLICT (poa_activity_id, zone_id) DO NOTHING;

-- Fixture Cuadrilla
INSERT INTO public.crews (id, board_id, name, code)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'ec0e0000-0000-0000-0000-000000000031',
  'Cuadrilla Test C1.5',
  'CRW-TEST-01'
)
ON CONFLICT (board_id, name) DO NOTHING;

-- Fixture Maquinaria
INSERT INTO public.machinery (id, board_id, code, name, category)
VALUES (
  '33333333-0000-0000-0000-000000000001',
  'ec0e0000-0000-0000-0000-000000000031',
  'MAQ-TEST-01',
  'Guadañadora Test',
  'GUADAÑA'
)
ON CONFLICT (board_id, code) DO NOTHING;

-- 1. CASO POSITIVO: Ítem legacy con planned_date NULL se reconcilia determinísticamente,
--    mientras que crew_id y machinery_id se preservan inviolablemente intactos.
INSERT INTO public.weekly_plan_items (
  id, plan_id, planned_sequence, activity_key, planned_rendimiento,
  planned_frecuencia, priority, planned_qty, unit, planned_jr,
  poa_activity_zone_id, planned_date, occurrence_key, is_manual_override,
  crew_id, machinery_id
) VALUES (
  '11111111-0000-0000-0000-000000000001',
  'd00d0000-0000-0000-0000-000000000031',
  1,
  'corte_grama',
  500,
  1,
  'must_execute',
  1000,
  'M2',
  2.0,
  'b0a00000-0000-0000-0000-000000000034',
  NULL, -- Legacy NULL date
  NULL, -- Legacy NULL occurrence_key
  false,
  '99999999-0000-0000-0000-000000000001', -- Crew asignado previamente
  '33333333-0000-0000-0000-000000000001'  -- Maquinaria asignada previamente
);

-- Configurar contexto de autenticación de admin_test
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":1,"activity_key":"corte_grama","planned_rendimiento":500,"planned_frecuencia":1,"priority":"must_execute","planned_qty":1200,"unit":"M2","planned_jr":2.4,"planned_date":"2026-09-28","occurrence_key":"occ-corte-1"}]'::jsonb
);

SELECT is(
  (SELECT planned_date FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  '2026-09-28'::DATE,
  '1. Reconciliación asigna planned_date calculada cuando la fila legacy tenía NULL'
);

SELECT is(
  (SELECT occurrence_key FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  'occ-corte-1',
  '2. Reconciliación asigna occurrence_key determinista'
);

SELECT is(
  (SELECT planned_qty FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  1200::NUMERIC,
  '3. Reconciliación actualiza cantidades teóricas gobernadas del estándar (Caso F)'
);

SELECT is(
  (SELECT crew_id FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  '99999999-0000-0000-0000-000000000001'::UUID,
  '4. Reconciliación preserva intacto el crew_id asignado previamente'
);

SELECT is(
  (SELECT machinery_id FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  '33333333-0000-0000-0000-000000000001'::UUID,
  '5. Reconciliación preserva intacto el machinery_id asignado previamente'
);

-- 4. CASO PROTECCIÓN 1: is_manual_override = true NO se sobrescribe
UPDATE public.weekly_plan_items
SET is_manual_override = true,
    override_reason = 'Supervisor cambio de fecha por lluvia',
    planned_date = '2026-09-29'
WHERE id = '11111111-0000-0000-0000-000000000001';

SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":1,"activity_key":"corte_grama","planned_rendimiento":500,"planned_frecuencia":1,"priority":"must_execute","planned_qty":9999,"unit":"M2","planned_jr":99,"planned_date":"2026-09-28","occurrence_key":"occ-corte-1"}]'::jsonb
);

SELECT is(
  (SELECT planned_date FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  '2026-09-29'::DATE,
  '6. is_manual_override = true protege la fecha manual contra sobrescritura del scheduler'
);

SELECT is(
  (SELECT planned_qty FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000001'),
  1200::NUMERIC,
  '7. is_manual_override = true protege cantidades teóricas modificadas'
);

-- 6. CASO PROTECCIÓN 2: executed_qty > 0 NO se sobrescribe
INSERT INTO public.weekly_plan_items (
  id, plan_id, planned_sequence, activity_key, planned_rendimiento,
  planned_frecuencia, priority, planned_qty, unit, planned_jr,
  poa_activity_zone_id, planned_date, occurrence_key, is_manual_override, executed_qty
) VALUES (
  '11111111-0000-0000-0000-000000000002',
  'd00d0000-0000-0000-0000-000000000031',
  2,
  'poda_arboles',
  10,
  4,
  'preferred',
  50,
  'und',
  5.0,
  'b0a00000-0000-0000-0000-000000000034',
  '2026-09-28',
  'occ-poda-2',
  false,
  25 -- Ya se ejecutaron 25 unidades en campo
);

SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":2,"activity_key":"poda_arboles","planned_rendimiento":10,"planned_frecuencia":4,"priority":"preferred","planned_qty":900,"unit":"und","planned_jr":90,"planned_date":"2026-10-01","occurrence_key":"occ-poda-2"}]'::jsonb
);

SELECT is(
  (SELECT planned_qty FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000002'),
  50::NUMERIC,
  '8. executed_qty > 0 protege absolutamente el ítem contra mutación'
);

-- 7. CASO PROTECCIÓN 3: executed_jr > 0 NO se sobrescribe
INSERT INTO public.weekly_plan_items (
  id, plan_id, planned_sequence, activity_key, planned_rendimiento,
  planned_frecuencia, priority, planned_qty, unit, planned_jr,
  poa_activity_zone_id, planned_date, occurrence_key, is_manual_override, executed_qty, executed_jr
) VALUES (
  '11111111-0000-0000-0000-000000000007',
  'd00d0000-0000-0000-0000-000000000031',
  7,
  'barrido_manual',
  2000,
  1,
  'must_execute',
  4000,
  'M2',
  2.0,
  'b0a00000-0000-0000-0000-000000000034',
  '2026-09-28',
  'occ-barrido-7',
  false,
  0,
  1.5 -- Jornales físicos ya consumidos
);

SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":7,"activity_key":"barrido_manual","planned_rendimiento":2000,"planned_frecuencia":1,"priority":"must_execute","planned_qty":9999,"unit":"M2","planned_jr":99,"planned_date":"2026-10-02","occurrence_key":"occ-barrido-7"}]'::jsonb
);

SELECT is(
  (SELECT planned_date FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000007'),
  '2026-09-28'::DATE,
  '9. executed_jr > 0 protege absolutamente el ítem contra mutación de fecha'
);

-- 8. CASO PROTECCIÓN 4: weekly_plan_item_executions existente (incluso con executed_qty = 0)
INSERT INTO public.weekly_plan_items (
  id, plan_id, planned_sequence, activity_key, planned_rendimiento,
  planned_frecuencia, priority, planned_qty, unit, planned_jr,
  poa_activity_zone_id, planned_date, occurrence_key, is_manual_override, executed_qty
) VALUES (
  '11111111-0000-0000-0000-000000000003',
  'd00d0000-0000-0000-0000-000000000031',
  3,
  'limpieza_playa',
  1000,
  1,
  'must_execute',
  3000,
  'M2',
  3.0,
  'b0a00000-0000-0000-0000-000000000034',
  '2026-09-28',
  'occ-playa-3',
  false,
  0
);

-- Simular jornada reportada en campo (con executed_qty = 0 por reporte de incidencia o inicio)
INSERT INTO public.weekly_plan_item_executions (
  id, plan_item_id, execution_date, executed_qty, status, worker_count, started_at, finished_at, created_by
) VALUES (
  'eeeeeeee-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000003',
  '2026-09-28',
  0,
  'reported',
  1,
  '2026-09-28 08:00:00+00',
  '2026-09-28 12:00:00+00',
  'aaaaaaaa-0000-0000-0000-000000000001'
);

SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":3,"activity_key":"limpieza_playa","planned_rendimiento":1000,"planned_frecuencia":1,"priority":"must_execute","planned_qty":9999,"unit":"M2","planned_jr":99,"planned_date":"2026-10-02","occurrence_key":"occ-playa-3"}]'::jsonb
);

SELECT is(
  (SELECT planned_date FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000003'),
  '2026-09-28'::DATE,
  '10. NOT EXISTS en weekly_plan_item_executions protege ítems con registros de jornada física'
);

-- 9. CASO PROTECCIÓN 5: Identidad de actividad (activity_key mismatch no transforma la fila)
INSERT INTO public.weekly_plan_items (
  id, plan_id, planned_sequence, activity_key, planned_rendimiento,
  planned_frecuencia, priority, planned_qty, unit, planned_jr,
  poa_activity_zone_id, planned_date, occurrence_key, is_manual_override
) VALUES (
  '11111111-0000-0000-0000-000000000004',
  'd00d0000-0000-0000-0000-000000000031',
  4,
  'actividad_original_A',
  100,
  1,
  'must_execute',
  100,
  'und',
  1.0,
  'b0a00000-0000-0000-0000-000000000034',
  '2026-09-28',
  'occ-A-4',
  false
);

SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":4,"activity_key":"actividad_distinta_B","planned_rendimiento":999,"planned_frecuencia":1,"priority":"must_execute","planned_qty":999,"unit":"und","planned_jr":9.9,"planned_date":"2026-09-28","occurrence_key":"occ-B-4"}]'::jsonb
);

SELECT is(
  (SELECT activity_key FROM public.weekly_plan_items WHERE id = '11111111-0000-0000-0000-000000000004'),
  'actividad_original_A',
  '11. Invariante de identidad preserva activity_key e impide mutación silenciosa de la actividad'
);

-- 10. Inserción de Nuevos Ítems (Secuencia no existente)
SELECT * FROM public.sync_weekly_plan_items_rpc(
  'd00d0000-0000-0000-0000-000000000031',
  '[{"planned_sequence":6,"activity_key":"nueva_actividad_6","planned_rendimiento":200,"planned_frecuencia":1,"priority":"must_execute","planned_qty":400,"unit":"M","planned_jr":2.0,"planned_date":"2026-09-28","occurrence_key":"occ-new-6"}]'::jsonb
);

SELECT is(
  (SELECT count(*)::int FROM public.weekly_plan_items WHERE plan_id = 'd00d0000-0000-0000-0000-000000000031' AND planned_sequence = 6),
  1,
  '12. Nuevas secuencias se insertan limpiamente vía INSERT normal'
);

-- 11. CASO PROTECCIÓN ESTADO TERMINAL: Plan en estado 'closed' rechaza la sincronización
INSERT INTO public.weekly_plans (id, board_id, group_id, week_start, period_number, status, created_by)
VALUES (
  'd00d0000-0000-0000-0000-000000000032',
  'ec0e0000-0000-0000-0000-000000000031',
  '5ca1ab1e-0000-0000-0000-000000003101',
  '2026-09-21',
  1,
  'closed',
  'aaaaaaaa-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

SELECT throws_ok(
  format(
    'SELECT * FROM public.sync_weekly_plan_items_rpc(''%s'', ''[{"planned_sequence":1,"activity_key":"corte_grama","planned_rendimiento":500,"planned_frecuencia":1,"priority":"must_execute","planned_qty":100,"unit":"M2","planned_jr":1.0,"planned_date":"2026-09-21","occurrence_key":"occ-corte-1"}]''::jsonb)',
    'd00d0000-0000-0000-0000-000000000032'
  ),
  'Operación denegada: El plan d00d0000-0000-0000-0000-000000000032 se encuentra en estado terminal (closed)',
  '13. sync_weekly_plan_items_rpc rechaza modificaciones sobre planes cerrados (closed)'
);

-- 12. CASO PROTECCIÓN ESTADO TERMINAL: Plan en estado 'cancelled' rechaza la sincronización
INSERT INTO public.weekly_plans (id, board_id, group_id, week_start, period_number, status, created_by)
VALUES (
  'd00d0000-0000-0000-0000-000000000033',
  'ec0e0000-0000-0000-0000-000000000031',
  '5ca1ab1e-0000-0000-0000-000000003101',
  '2026-09-14',
  1,
  'cancelled',
  'aaaaaaaa-0000-0000-0000-000000000001'
)
ON CONFLICT (id) DO NOTHING;

SELECT throws_ok(
  format(
    'SELECT * FROM public.sync_weekly_plan_items_rpc(''%s'', ''[{"planned_sequence":1,"activity_key":"corte_grama","planned_rendimiento":500,"planned_frecuencia":1,"priority":"must_execute","planned_qty":100,"unit":"M2","planned_jr":1.0,"planned_date":"2026-09-14","occurrence_key":"occ-corte-1"}]''::jsonb)',
    'd00d0000-0000-0000-0000-000000000033'
  ),
  'Operación denegada: El plan d00d0000-0000-0000-0000-000000000033 se encuentra en estado terminal (cancelled)',
  '14. sync_weekly_plan_items_rpc rechaza modificaciones sobre planes cancelados (cancelled)'
);

SELECT * FROM finish();
ROLLBACK;

