-- =============================================================================
-- Migration: 20260908_ensure_weekly_plan_materialized_rpc.sql
-- Gateway RPCs: SECURITY DEFINER Authorization Gateway + Trusted DTO Persistence Sink
-- Baseline: 2386465 + ADR-0007..ADR-0012 + Módulo 2 & 3 + Modelo A (Trusted DTO Sink)
-- =============================================================================

-- 1. Cabecera Weekly Plan (SECURITY DEFINER Authorization Gateway)
CREATE OR REPLACE FUNCTION public.ensure_weekly_plan_header(
  p_board_id       UUID,
  p_group_id       UUID,
  p_week_start     DATE,
  p_period_number  INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_has_role    BOOLEAN;
  v_group_valid BOOLEAN;
  v_plan_id     UUID;
BEGIN
  -- A. Validar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Usuario no autenticado';
  END IF;

  -- B. Validar autorización de rol operativo (leader, assistant, admin) en el tablero
  v_has_role := public.can_report_execution(p_board_id, auth.uid());
  IF NOT v_has_role THEN
    RAISE EXCEPTION 'Acceso denegado: El usuario no posee permisos operativos (líder, asistente, admin) en el tablero %', p_board_id;
  END IF;

  -- C. Validar pertenencia estricta del sitio (group_id) al tablero
  SELECT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND board_id = p_board_id
  ) INTO v_group_valid;

  IF NOT v_group_valid THEN
    RAISE EXCEPTION 'El sitio % no pertenece al tablero %', p_group_id, p_board_id;
  END IF;

  -- D. Inserción atómica idempotente (ON CONFLICT DO NOTHING + SELECT)
  -- Contrato Lifecycle: status published con trazabilidad (published_by, published_at)
  INSERT INTO public.weekly_plans (
    board_id,
    group_id,
    week_start,
    period_number,
    status,
    published_by,
    published_at,
    created_by
  )
  VALUES (
    p_board_id,
    p_group_id,
    p_week_start,
    p_period_number,
    'published',
    auth.uid(),
    NOW(),
    auth.uid()
  )
  ON CONFLICT (board_id, group_id, week_start) DO NOTHING;

  SELECT id INTO v_plan_id
  FROM public.weekly_plans
  WHERE board_id = p_board_id AND group_id = p_group_id AND week_start = p_week_start;

  RETURN v_plan_id;
END;
$$;

-- 2. Sincronización de Ítems (Trusted DTO Persistence Sink con Conversión Segura y COALESCE poa_activity_zone_id)
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
  v_has_role BOOLEAN;
BEGIN
  -- A. Validar autenticación
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Usuario no autenticado';
  END IF;

  -- B. Validar payload JSON DTO no nulo ni vacío
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  -- C. Obtener board_id y group_id del plan para validación de frontera cruzada (sitio + tablero)
  SELECT board_id, group_id INTO v_board_id, v_group_id FROM public.weekly_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
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

  -- F. Inserción con conversión segura por construcción (CASE WHEN jsonb_typeof = 'number') y COALESCE poa_activity_zone_id
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
    planned_date
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
      (SELECT id FROM public.poa_activity_zones LIMIT 1)
    ),
    (item->>'planned_date')::DATE
  FROM jsonb_array_elements(p_items) AS item
  WHERE jsonb_typeof(item->'planned_sequence') = 'number'
    AND (item->>'planned_sequence')::INT > 0
    AND item->>'activity_key' IS NOT NULL
    AND jsonb_typeof(item->'planned_qty') = 'number'
    AND (item->>'planned_qty')::NUMERIC >= 0
    AND jsonb_typeof(item->'planned_jr') = 'number'
    AND (item->>'planned_jr')::NUMERIC >= 0
  ON CONFLICT (plan_id, planned_sequence) DO NOTHING
  RETURNING *;
END;
$$;

-- Permisos explícitos de ejecución
REVOKE EXECUTE ON FUNCTION public.ensure_weekly_plan_header(UUID, UUID, DATE, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_weekly_plan_header(UUID, UUID, DATE, INT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) TO authenticated;
