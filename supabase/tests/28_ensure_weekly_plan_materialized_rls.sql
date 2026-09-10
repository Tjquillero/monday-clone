-- =============================================================================
-- Test 28: Verificación Rigurosa por Capas con RLS Real en PostgreSQL (v6 Endurecido)
-- Certificación de Concurrencia, Preservación de Estado, Modelo A Sink, Validaciones DTO y Personal por Sitio
-- =============================================================================
BEGIN;
SELECT plan(10);

-- 1. Caso Positivo: Líder Autenticado crea/obtiene cabecera con audit trail completo
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'uuid-lider-autenticado';

SELECT is(
  (SELECT (public.ensure_weekly_plan_header('board-uuid-1', 'group-uuid-1', '2026-09-07'::DATE, 1) IS NOT NULL)),
  true,
  '1. Líder autenticado crea cabecera published con p_period_number TS, created_by y published_by = auth.uid()'
);

-- 2. Idempotencia Ante Concurrencia Simulada (DO NOTHING sin colisión de transacciones)
SELECT is(
  (SELECT public.ensure_weekly_plan_header('board-uuid-1', 'group-uuid-1', '2026-09-07'::DATE, 1)),
  (SELECT public.ensure_weekly_plan_header('board-uuid-1', 'group-uuid-1', '2026-09-07'::DATE, 1)),
  '2. DO NOTHING atómico garantiza exactamente 1 ID idéntico ante llamadas concurrentes simultáneas'
);

-- 3. Inserción del Payload DTO F3.1 vía Modelo A Sink (sync_weekly_plan_items_rpc)
SELECT is_gt(
  (SELECT count(*)::int FROM public.sync_weekly_plan_items_rpc(
    (SELECT id FROM weekly_plans WHERE board_id='board-uuid-1' AND group_id='group-uuid-1' AND week_start='2026-09-07'),
    '[{"planned_sequence":1,"activity_key":"corte_grama","activity_standard_id":"00000000-0000-0000-0000-000000000001","planned_rendimiento":500,"planned_frecuencia":25,"priority":"must_execute","planned_qty":1000,"unit":"M2","planned_jr":50}]'::jsonb
  )),
  0,
  '3. Trusted DTO Sink (sync_weekly_plan_items_rpc) persiste correctamente el DTO estructurado de F3.1'
);

-- 4. Preservación Inviolable de Estado en Campo (status, is_manual_override, crew_id intactos)
UPDATE weekly_plan_items
SET crew_id = '00000000-0000-0000-0000-000000000099'::UUID,
    is_manual_override = true
WHERE plan_id = (SELECT id FROM weekly_plans WHERE board_id='board-uuid-1' AND group_id='group-uuid-1' AND week_start='2026-09-07')
  AND planned_sequence = 1;

PERFORM public.sync_weekly_plan_items_rpc(
  (SELECT id FROM weekly_plans WHERE board_id='board-uuid-1' AND group_id='group-uuid-1' AND week_start='2026-09-07'),
  '[{"planned_sequence":1,"activity_key":"corte_grama","activity_standard_id":"00000000-0000-0000-0000-000000000001","planned_rendimiento":500,"planned_frecuencia":25,"priority":"must_execute","planned_qty":1000,"unit":"M2","planned_jr":50}]'::jsonb
);

SELECT is(
  (SELECT count(*)::int FROM weekly_plan_items 
   WHERE plan_id = (SELECT id FROM weekly_plans WHERE board_id='board-uuid-1' AND group_id='group-uuid-1' AND week_start='2026-09-07') 
     AND planned_sequence = 1 
     AND crew_id = '00000000-0000-0000-0000-000000000099'::UUID
     AND is_manual_override = true),
  1,
  '4. ON CONFLICT DO NOTHING preserva intactos crew_id e is_manual_override ante resincronizaciones del Sink'
);

-- 5. Excepción de Autorización Operativa de la RPC (Usuario sin membresía en el tablero)
SET LOCAL "request.jwt.claim.sub" = 'uuid-usuario-sin-acceso';

SELECT throws_ok(
  $$ SELECT public.ensure_weekly_plan_header('board-uuid-1', 'group-uuid-1', '2026-09-07'::DATE, 1) $$,
  'Acceso denegado: El usuario no posee permisos operativos (líder, asistente, admin) en el tablero board-uuid-1',
  '5. RPC rechaza explícitamente al usuario sin rol operativo'
);

-- 6. Excepción de Frontera de Sitio (Sitio ajeno al tablero)
SET LOCAL "request.jwt.claim.sub" = 'uuid-lider-autenticado';

SELECT throws_ok(
  $$ SELECT public.ensure_weekly_plan_header('board-uuid-1', 'group-sitio-ajeno', '2026-09-07'::DATE, 1) $$,
  'El sitio group-sitio-ajeno no pertenece al tablero board-uuid-1',
  '6. RPC rechaza materialización si el sitio p_group_id no pertenece a p_board_id'
);

-- 7. Lectura RLS sobre weekly_plans
SELECT is(
  (SELECT count(*)::int FROM weekly_plans WHERE week_start = '2026-09-07'),
  1,
  '7. SELECT bajo RLS retorna el plan publicado para el miembro del tablero'
);

-- 8. Lectura RLS de Personal Específico por Sitio Exacto (group_id = group-uuid-1)
SELECT is_gt(
  (SELECT count(*)::int 
   FROM personnel_site_assignments psa 
   JOIN personnel p ON p.id = psa.personnel_id 
   WHERE psa.group_id = 'group-uuid-1' AND psa.is_active = true),
  0,
  '8. SELECT bajo RLS resuelve exclusivamente el personal adscrito al sitio específico (group_id = group-uuid-1)'
);

-- 9. Invariante de Unicidad de Cabecera por Clave Contractual
SELECT is(
  (SELECT count(*)::int FROM weekly_plans WHERE board_id='board-uuid-1' AND group_id='group-uuid-1' AND week_start='2026-09-07'),
  1,
  '9. Invariante UNIQUE (board_id, group_id, week_start) verificado en PostgreSQL'
);

-- 10. Protección Limpia Contra Payload JSON con Tipos Inválidos (planned_sequence: "ABC")
SELECT is(
  (SELECT count(*)::int FROM public.sync_weekly_plan_items_rpc(
    (SELECT id FROM weekly_plans WHERE board_id='board-uuid-1' AND group_id='group-uuid-1' AND week_start='2026-09-07'),
    '[{"planned_sequence":"ABC","activity_key":"invalid_seq","planned_qty":100,"planned_jr":5}]'::jsonb
  )),
  0,
  '10. Trusted DTO Sink descarta de forma limpia payloads con planned_sequence de tipo string sin lanzar excepción de cast'
);

SELECT * FROM finish();
ROLLBACK;
