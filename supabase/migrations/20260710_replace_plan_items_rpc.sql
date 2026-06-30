-- =============================================================================
-- replace_weekly_plan_items(plan_id, jsonb_items)
--
-- Reemplaza TODOS los items de un plan draft en una sola transacción.
-- Sin esta función, el cliente haría DELETE + INSERT secuencial, lo que
-- deja el plan vacío si falla la red entre ambas operaciones.
--
-- Parámetros:
--   p_plan_id  UUID  — ID del plan (debe estar en estado 'draft')
--   p_items    JSONB — array de objetos con la forma de PlanItemInput:
--     [{ planned_sequence, activity_key, activity_standard_id,
--        planned_rendimiento, planned_frecuencia, priority,
--        planned_qty, unit, planned_jr }, ...]
--
-- Retorna: SETOF weekly_plan_items — las filas insertadas
--
-- Valida:
--   - Plan existe
--   - Caller tiene can_manage_weekly_plan()
--   - Plan está en estado 'draft'
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_weekly_plan_items(
  p_plan_id UUID,
  p_items   JSONB
)
RETURNS SETOF public.weekly_plan_items
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE v_plan public.weekly_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF NOT public.can_manage_weekly_plan(v_plan.board_id, auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para editar items de este plan.';
  END IF;
  IF v_plan.status != 'draft' THEN
    RAISE EXCEPTION
      'Solo se pueden reemplazar items de un plan en estado draft. Estado actual: %', v_plan.status;
  END IF;

  DELETE FROM public.weekly_plan_items WHERE plan_id = p_plan_id;

  RETURN QUERY
  INSERT INTO public.weekly_plan_items (
    plan_id,
    planned_sequence,
    activity_key,
    activity_standard_id,
    planned_rendimiento,
    planned_frecuencia,
    priority,
    planned_qty,
    unit,
    planned_jr
  )
  SELECT
    p_plan_id,
    (item->>'planned_sequence')::INT,
    item->>'activity_key',
    (item->>'activity_standard_id')::UUID,
    (item->>'planned_rendimiento')::NUMERIC,
    (item->>'planned_frecuencia')::NUMERIC,
    (item->>'priority')::TEXT,
    (item->>'planned_qty')::NUMERIC,
    item->>'unit',
    (item->>'planned_jr')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item
  RETURNING *;
END;
$$;
