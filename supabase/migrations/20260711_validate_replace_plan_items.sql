-- =============================================================================
-- replace_weekly_plan_items — versión endurecida
--
-- Cambios respecto a 20260710:
--
-- 1. Valida que cada activity_standard_id exista, pertenezca al board del plan
--    y esté activo (effective_to IS NULL).  Un UUID inventado o de otro board
--    levanta excepción antes de tocar datos.
--
-- 2. Valida valores de negocio en el JSON de entrada:
--    - planned_sequence >= 1 y único dentro del lote
--    - planned_qty > 0
--    - planned_jr >= 0
--    - priority ∈ ('must_execute', 'preferred', 'flexible')
--
-- 3. Cambia RETURN QUERY INSERT…RETURNING * por un SELECT final.
--    INSERT RETURNING no refleja modificaciones hechas por AFTER triggers;
--    el SELECT post-insert devuelve el estado real de la fila en la tabla.
--
-- Las validaciones 1 y 2 lanzan mensajes de error descriptivos para que
-- el cliente pueda mostrarlos directamente al usuario.
--
-- NOTA HISTÓRICA (2026-07-12, restaurada tras un borrado erróneo): esta
-- migración SÍ se aplicó contra la base real (confirmado vía
-- `supabase migration list --linked`, columna Remote) — 4 días después,
-- 20260715_replace_plan_items_poa.sql reemplazó activity_standard_id por
-- poa_activity_zone_id (repunte al POA, ADR-0002), y ESA es la versión
-- vigente hoy de replace_weekly_plan_items(). El archivo se conserva como
-- registro histórico del esquema, aunque su efecto ya fue superado — una
-- migración una vez aplicada nunca se borra, se reemplaza con otra.
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
  FOR UPDATE;                    -- serializa ediciones concurrentes al mismo plan

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

    -- 2c. activity_standard_id existe, pertenece al board y está activo.
    --     Acepta estándares de contrato (group_id IS NULL) o del sitio del plan.
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) AS item
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.board_activity_standards bas
        WHERE bas.id        = (item->>'activity_standard_id')::UUID
          AND bas.board_id  = v_plan.board_id
          AND (bas.group_id IS NULL OR bas.group_id = v_plan.group_id)
          AND bas.effective_to IS NULL          -- solo estándares activos
      )
    ) THEN
      RAISE EXCEPTION
        'Uno o más activity_standard_id no existen, no pertenecen a este board/sitio, '
        'o corresponden a una versión archivada';
    END IF;

  END IF;

  -- ── 3. Reemplazo atómico ────────────────────────────────────────────────────
  DELETE FROM public.weekly_plan_items WHERE plan_id = p_plan_id;

  IF v_item_count > 0 THEN
    INSERT INTO public.weekly_plan_items (
      plan_id, planned_sequence, activity_key, activity_standard_id,
      planned_rendimiento, planned_frecuencia, priority,
      planned_qty, unit, planned_jr
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
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  -- ── 4. Devuelve estado definitivo (post-triggers) ────────────────────────────
  RETURN QUERY
  SELECT * FROM public.weekly_plan_items
  WHERE  plan_id = p_plan_id
  ORDER BY planned_sequence;
END;
$$;
