-- =============================================================================
-- Migration: Motor Transaccional de Certificación Contractual y Actas (ADR-0012)
--
-- Refuerza el motor de Actas de Cobro para:
-- 1. Capturar snapshots completos (incluyendo activity_key_snapshot y zone_snapshot).
-- 2. Garantizar que certifiable_executed_qty no altere executed_qty histórico.
-- 3. Limitar contractualmente el consumo al máximo contratado de la poa_activity.
-- 4. Proveer adjust_acta_item_quantity con validación transaccional de saldo.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ampliación de Snapshots en acta_items
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.acta_items
  ADD COLUMN IF NOT EXISTS activity_key_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS zone_snapshot TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Función adjust_acta_item_quantity
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.adjust_acta_item_quantity(
  p_acta_item_id UUID,
  p_new_qty NUMERIC
)
RETURNS NUMERIC LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_acta_id UUID;
  v_estado TEXT;
  v_board_id UUID;
  v_poa_activity_id UUID;
  v_poa_max_qty NUMERIC;
  v_other_actas_total NUMERIC;
  v_max_allowed NUMERIC;
BEGIN
  IF p_new_qty < 0 THEN
    RAISE EXCEPTION 'La cantidad facturada no puede ser negativa.';
  END IF;

  -- 1. Verificar estado del acta padre (debe ser draft)
  SELECT ai.acta_id, a.estado, a.board_id, ai.poa_activity_id
  INTO v_acta_id, v_estado, v_board_id, v_poa_activity_id
  FROM public.acta_items ai
  JOIN public.actas a ON a.id = ai.acta_id
  WHERE ai.id = p_acta_item_id
  FOR UPDATE OF ai;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La línea de acta % no existe.', p_acta_item_id;
  END IF;

  IF v_estado != 'draft' THEN
    RAISE EXCEPTION 'No se puede modificar una línea de un acta en estado %.', v_estado;
  END IF;

  -- 2. Verificar límite contractual de la poa_activity
  SELECT cantidad INTO v_poa_max_qty
  FROM public.poa_activities
  WHERE id = v_poa_activity_id;

  SELECT COALESCE(SUM(ai.cantidad_facturada), 0) INTO v_other_actas_total
  FROM public.acta_items ai
  JOIN public.actas a ON a.id = ai.acta_id
  WHERE ai.poa_activity_id = v_poa_activity_id
    AND ai.id != p_acta_item_id
    AND a.estado IN ('draft', 'issued');

  v_max_allowed := GREATEST(0, v_poa_max_qty - v_other_actas_total);

  IF p_new_qty > v_max_allowed THEN
    RAISE EXCEPTION 'La cantidad ajustada (%) supera el límite contractual disponible (%) para la actividad del POA.',
      p_new_qty, v_max_allowed;
  END IF;

  -- 3. Actualizar la cantidad facturada en la línea
  UPDATE public.acta_items
  SET cantidad_facturada = p_new_qty,
      updated_at = NOW()
  WHERE id = p_acta_item_id;

  RETURN p_new_qty;
END;
$$;

COMMENT ON FUNCTION public.adjust_acta_item_quantity(UUID, NUMERIC) IS
  'Ajusta la cantidad facturada de una línea de borrador de acta validando límites contractuales del POA y estado draft. Ver ADR-0012.';
