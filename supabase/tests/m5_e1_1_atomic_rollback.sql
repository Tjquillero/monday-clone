-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.1: Atomicidad Dominio -> Notificación en PostgreSQL
-- ============================================================================
-- Propósito: Demostrar empíricamente que la mutación de dominio (UPDATE en 
-- weekly_plan_item_executions) y la inserción del Read Model (dispatch_user_notification)
-- ocurren dentro de la MISMA transacción de PostgreSQL. Al ejecutar ROLLBACK,
-- AMBAS operaciones se revierten simultáneamente, restaurando la ejecución a 'reported'
-- y dejando exactamente 0 notificaciones.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 1: Setup Soberano de Tablero, Usuario, Plan y Registro de Ejecución
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_board_id uuid := 'e1100000-0000-0000-0000-000000000001'::uuid;
  v_user_id  uuid := 'e1100000-0000-0000-0000-000000000002'::uuid;
  v_plan_id  uuid := 'e1100000-0000-0000-0000-000000000003'::uuid;
  v_item_id  uuid := 'e1100000-0000-0000-0000-000000000004'::uuid;
  v_exec_id  uuid := 'e1100000-0000-0000-0000-000000000005'::uuid;
BEGIN
  -- Insertar usuario autenticado
  INSERT INTO auth.users (id, email)
  VALUES (v_user_id, 'supervisor_atomicity@mantenix.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insertar tablero de obra
  INSERT INTO public.boards (id, name)
  VALUES (v_board_id, 'Tablero Verificación Atomicidad M5')
  ON CONFLICT (id) DO NOTHING;

  -- Asignar rol de SUPERVISOR activo al usuario en el tablero
  INSERT INTO public.user_board_roles (user_id, board_id, role, is_active)
  VALUES (v_user_id, v_board_id, 'SUPERVISOR', true)
  ON CONFLICT (user_id, board_id, role) DO NOTHING;

  -- Insertar WeeklyPlan cabecera si la tabla existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_plans') THEN
    INSERT INTO public.weekly_plans (id, board_id, week_start_date, status)
    VALUES (v_plan_id, v_board_id, '2026-09-14', 'published')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insertar WeeklyPlanItem si existe la tabla
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_plan_items') THEN
    INSERT INTO public.weekly_plan_items (id, weekly_plan_id, plan_id, board_id, planned_qty, status)
    VALUES (v_item_id, v_plan_id, v_plan_id, v_board_id, 100, 'in_progress')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insertar ExecutionRecord inicial en estado 'reported'
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'weekly_plan_item_executions') THEN
    INSERT INTO public.weekly_plan_item_executions (id, weekly_plan_item_id, board_id, executed_qty, verification_status)
    VALUES (v_exec_id, v_item_id, v_board_id, 50, 'reported')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- PASO 2: Demostración de Atomicidad Conjunta en Transacción Abierta
-- ----------------------------------------------------------------------------
BEGIN;

-- A. Mutación Soberana de Dominio (Transición reported -> verified)
UPDATE public.weekly_plan_item_executions
SET verification_status = 'verified', verified_at = NOW()
WHERE id = 'e1100000-0000-0000-0000-000000000005'::uuid;

-- B. Invocación del Dispatcher RPC en la MISMA Transacción PostgreSQL
SELECT public.dispatch_user_notification(
  p_event_id       => 'evt-atomic-domain-notif-001',
  p_board_id       => 'e1100000-0000-0000-0000-000000000001'::uuid,
  p_alert_code     => 'ALERT-01',
  p_entity_id      => 'e1100000-0000-0000-0000-000000000005',
  p_severity      => 'CRITICAL',
  p_title          => 'Verificación de Ejecución Atomica',
  p_message        => 'Verificando atomicidad conjunta Dominio + Notificación',
  p_eligible_roles => ARRAY['SUPERVISOR']
);

-- C. Verificación de Estado Intermedio DENTRO de la Transacción Abierta
SELECT 
  'DENTRO DE TX ABIERTA' AS momento,
  (SELECT verification_status FROM public.weekly_plan_item_executions WHERE id = 'e1100000-0000-0000-0000-000000000005'::uuid) AS estado_dominio_transitorio,
  (SELECT COUNT(*) FROM public.user_notifications WHERE event_id = 'evt-atomic-domain-notif-001') AS notificaciones_transitorias;

-- D. REVERSIÓN EXTERNA DE LA TRANSACCIÓN COMPLETA
ROLLBACK;

-- ----------------------------------------------------------------------------
-- PASO 3: Verificación Física Post-Rollback (Cero Notificaciones + Dominio Revertido)
-- ----------------------------------------------------------------------------
SELECT 
  'POST-ROLLBACK (FINAL)' AS momento,
  (SELECT verification_status FROM public.weekly_plan_item_executions WHERE id = 'e1100000-0000-0000-0000-000000000005'::uuid) AS estado_dominio_restaurado,
  'reported' AS estado_dominio_esperado,
  (SELECT COUNT(*) FROM public.user_notifications WHERE event_id = 'evt-atomic-domain-notif-001') AS notificaciones_huérfanas,
  0 AS notificaciones_esperadas;
