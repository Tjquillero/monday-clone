-- Migration: 2026100301_reset_weekly_plan_items.sql
-- Module: PLAN-REDO-01 Reprogramar semana gobernada
-- Specification: GATE PLAN-REDO-01

CREATE OR REPLACE FUNCTION public.reset_weekly_plan_items(
  p_plan_id UUID,
  p_reason TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID;
  v_reason_clean TEXT;
  v_plan RECORD;
  v_deleted_items JSONB;
  v_deleted_count INT;
  v_event_id TEXT;
  v_payload JSONB;
BEGIN
  -- 1. Validar autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'RESET_DENIED: no autenticado';
  END IF;

  -- 2. Validar motivo obligatorio (mínimo 10 caracteres sin espacios extremos)
  v_reason_clean := btrim(COALESCE(p_reason, ''));
  IF length(v_reason_clean) < 10 THEN
    RAISE EXCEPTION 'RESET_REASON_REQUIRED';
  END IF;

  -- 3. Bloquear el plan con FOR UPDATE y verificar existencia
  SELECT wp.id, wp.board_id, wp.group_id, wp.week_start, wp.status
  INTO v_plan
  FROM public.weekly_plans wp
  WHERE wp.id = p_plan_id
  FOR UPDATE;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'RESET_PLAN_NOT_FOUND';
  END IF;

  -- 4. Validar autorización de gestión del plan
  IF NOT public.can_manage_weekly_plan(v_plan.board_id, v_user_id) THEN
    RAISE EXCEPTION 'RESET_DENIED';
  END IF;

  -- 5. Validar estado del plan (solo draft o published)
  IF v_plan.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'RESET_INVALID_STATUS: %', v_plan.status;
  END IF;

  -- 6. Validar que la semana sea futura (no iniciada según hora Colombia)
  IF v_plan.week_start <= (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'RESET_WEEK_STARTED';
  END IF;

  -- 7. Validar que no existan ejecuciones para los ítems del plan
  IF EXISTS (
    SELECT 1
    FROM public.weekly_plan_item_executions wpie
    JOIN public.weekly_plan_items wpi ON wpi.id = wpie.plan_item_id
    WHERE wpi.plan_id = p_plan_id
  ) THEN
    RAISE EXCEPTION 'RESET_HAS_EXECUTIONS';
  END IF;

  -- 8. Recolectar snapshot de ítems a eliminar y registrar evento de auditoría
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'activity_key', wpi.activity_key,
          'planned_date', wpi.planned_date,
          'planned_qty', wpi.planned_qty,
          'planned_jr', wpi.planned_jr,
          'planned_frecuencia', wpi.planned_frecuencia
        ) ORDER BY wpi.planned_date, wpi.activity_key
      ),
      '[]'::jsonb
    ),
    COUNT(*)
  INTO v_deleted_items, v_deleted_count
  FROM public.weekly_plan_items wpi
  WHERE wpi.plan_id = p_plan_id;

  v_event_id := 'reset-' || v_plan.week_start::text || '-' || COALESCE(v_plan.group_id::text, 'global') || '-' || gen_random_uuid()::text;

  v_payload := jsonb_build_object(
    'reason', v_reason_clean,
    'item_count', v_deleted_count,
    'items', v_deleted_items
  );

  INSERT INTO public.materialization_events (
    event_id,
    event_type,
    board_id,
    group_id,
    week_start,
    plan_id,
    status,
    actor_id,
    payload,
    created_at
  ) VALUES (
    v_event_id,
    'PLAN_ITEMS_RESET',
    v_plan.board_id,
    v_plan.group_id,
    v_plan.week_start,
    v_plan.id,
    'SUCCESS',
    v_user_id,
    v_payload,
    now()
  );

  -- 9. Eliminar los ítems del plan y retornar cantidad
  DELETE FROM public.weekly_plan_items
  WHERE plan_id = p_plan_id;

  RETURN v_deleted_count;
END;
$$;

-- Permisos
REVOKE ALL ON FUNCTION public.reset_weekly_plan_items(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_weekly_plan_items(UUID, TEXT) TO authenticated;
