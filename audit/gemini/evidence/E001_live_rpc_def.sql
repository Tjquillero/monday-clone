-- MD5: 96316db12584401945784bb5c2f83d36
-- Origin: 2026091401_restore_weekly_plan_items_schema.sql
CREATE OR REPLACE FUNCTION public.sync_weekly_plan_items_rpc(p_plan_id uuid, p_items jsonb)
 RETURNS SETOF weekly_plan_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_board_id UUID;
  v_group_id UUID;
  v_has_role BOOLEAN;
BEGIN
  -- A. Validar autenticacion
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acceso denegado: Usuario no autenticado';
  END IF;

  -- B. Validar payload JSON DTO no nulo ni vacio
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  -- C. Obtener board_id y group_id del plan para validacion de frontera cruzada (sitio + tablero)
  SELECT board_id, group_id INTO v_board_id, v_group_id 
  FROM public.weekly_plans 
  WHERE id = p_plan_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;

  -- D. Validar autorizacion operativa (leader, assistant, admin) en el tablero
  v_has_role := public.can_report_execution(v_board_id, auth.uid());
  IF NOT v_has_role THEN
    RAISE EXCEPTION 'Acceso denegado para sincronizar items en el plan %', p_plan_id;
  END IF;

  -- E. Validar pertenencia del sitio (group_id) al tablero del plan
  IF v_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.groups WHERE id = v_group_id AND board_id = v_board_id
  ) THEN
    RAISE EXCEPTION 'Frontera de sitio denegada: El sitio del plan no pertenece al tablero %', v_board_id;
  END IF;

  -- F. Insercion con conversion segura por construccion (planned_date obligatorio en nuevas filas)
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
      (SELECT id FROM public.poa_activity_zones LIMIT 1)
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
  ON CONFLICT (plan_id, planned_sequence) DO NOTHING
  RETURNING *;
END;
$function$;
