-- =============================================================================
-- Migration: 2026092801_reconcile_weekly_plan_items_gateway.sql
-- Description: Governed Temporal Reconciliation for weekly_plan_items Sink Gateway (C1.5 v1.1)
-- Governance:
--   - Replaces ON CONFLICT DO NOTHING with Governed Reconciling DO UPDATE.
--   - Protects human manual overrides (is_manual_override = true).
--   - Protects physical field reality (executed_qty > 0 OR executed_jr > 0 OR weekly_plan_item_executions EXISTS).
--   - Protects activity identity (activity_key must match, occurrence_key compatible).
--   - Reconciles missing planned_date and theoretical standard quantities deterministically.
-- =============================================================================

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

-- Permisos explícitos de ejecución
REVOKE EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) IS 
'Trusted DTO Sink Gateway con Reconciliación Gobernada v1.1: Protege overrides manuales, realidad física y preserva identidad.';
