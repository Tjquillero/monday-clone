-- =============================================================================
-- replace_weekly_plan_items — repunte a la fuente contractual POA (ADR-0002)
--
-- Cambios respecto a 20260711:
--
-- 1. El JSON de entrada usa `poa_activity_zone_id` en vez de `activity_standard_id`.
-- 2. La validación 2c ahora verifica que poa_activity_zone_id exista, que su zona
--    (zone_id) coincida con el group_id del plan, y que pertenezca a la versión
--    ACTIVA del POA de este board (join poa_activity_zones → poa_activities →
--    poa_versions → poa, status = 'active').
--
-- La firma de la función no cambia (p_plan_id, p_items JSONB) — solo el
-- contenido esperado dentro de cada elemento del array.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_weekly_plan_items(
  p_plan_id UUID,
  p_items   JSONB
)
RETURNS SETOF public.weekly_plan_items
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan public.weekly_plans%ROWTYPE;
  v_item_count INT;
BEGIN
  -- ── 1. Plan: existe + no está bloqueado + permisos ─────────────────────────
  SELECT * INTO v_plan
  FROM public.weekly_plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF NOT public.can_manage_weekly_plan(v_plan.board_id, auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para editar items de este plan';
  END IF;
  IF v_plan.status != 'draft' THEN
    RAISE EXCEPTION
      'Solo se pueden reemplazar items de un plan en estado draft. Estado actual: %',
      v_plan.status;
  END IF;

  -- ── 2. Validaciones de negocio sobre el JSON ────────────────────────────────
  v_item_count := jsonb_array_length(p_items);

  IF v_item_count > 0 THEN

    -- 2a. planned_sequence único dentro del lote
    IF EXISTS (
      SELECT (item->>'planned_sequence')::INT
      FROM jsonb_array_elements(p_items) AS item
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'planned_sequence debe ser único entre los items del plan';
    END IF;

    -- 2b. Valores numéricos y enum
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS item
      WHERE (item->>'planned_sequence')::INT < 1
         OR (item->>'planned_qty')::NUMERIC <= 0
         OR (item->>'planned_jr')::NUMERIC  < 0
         OR (item->>'planned_rendimiento')::NUMERIC <= 0
         OR (item->>'planned_frecuencia')::NUMERIC  <= 0
         OR (item->>'priority') NOT IN ('must_execute', 'preferred', 'flexible')
    ) THEN
      RAISE EXCEPTION
        'Item inválido: planned_sequence >= 1, planned_qty > 0, planned_jr >= 0, '
        'planned_rendimiento > 0, planned_frecuencia > 0, priority en (must_execute|preferred|flexible)';
    END IF;

    -- 2c. poa_activity_zone_id existe, corresponde a la zona del plan y
    --     pertenece a la versión ACTIVA del POA de este board (Regla 2 y
    --     Regla 13 de poa-domain.md: el Cronograma solo nace de una versión
    --     aprobada y vigente).
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS item
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.poa_activity_zones paz
        JOIN   public.poa_activities   pa ON pa.id = paz.poa_activity_id
        JOIN   public.poa_versions     pv ON pv.id = pa.poa_version_id
        JOIN   public.poa              p  ON p.id  = pv.poa_id
        WHERE  paz.id       = (item->>'poa_activity_zone_id')::UUID
          AND  paz.zone_id  = v_plan.group_id
          AND  p.board_id   = v_plan.board_id
          AND  pv.status    = 'active'
      )
    ) THEN
      RAISE EXCEPTION
        'Uno o más poa_activity_zone_id no existen, no corresponden a la zona de este plan, '
        'o no pertenecen a la versión activa del POA de este board';
    END IF;

  END IF;

  -- ── 3. Reemplazo atómico ────────────────────────────────────────────────────
  DELETE FROM public.weekly_plan_items WHERE plan_id = p_plan_id;

  IF v_item_count > 0 THEN
    INSERT INTO public.weekly_plan_items (
      plan_id, planned_sequence, activity_key, poa_activity_zone_id,
      planned_rendimiento, planned_frecuencia, priority,
      planned_qty, unit, planned_jr
    )
    SELECT
      p_plan_id,
      (item->>'planned_sequence')::INT,
      item->>'activity_key',
      (item->>'poa_activity_zone_id')::UUID,
      (item->>'planned_rendimiento')::NUMERIC,
      (item->>'planned_frecuencia')::NUMERIC,
      (item->>'priority')::TEXT,
      (item->>'planned_qty')::NUMERIC,
      item->>'unit',
      (item->>'planned_jr')::NUMERIC
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  -- ── 4. Devuelve estado definitivo (post-triggers) ────────────────────────────
  RETURN QUERY
  SELECT * FROM public.weekly_plan_items
  WHERE  plan_id = p_plan_id
  ORDER BY planned_sequence;
END;
$$;
