-- =============================================================================
-- Migration: Guard de Sobrefacturación en ActaItemSource (ADR-0003)
--
-- Garantiza a nivel de motor SQL (trigger) que la suma de cantidad_consumida
-- para cualquier execution_id a través de TODAS las actas NUNCA supere
-- la cantidad ejecutada (executed_qty) de esa ejecución.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_acta_item_source_overbilling()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_executed_qty NUMERIC;
  v_total_consumed NUMERIC;
  v_exec_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_exec_id := OLD.execution_id;
  ELSE
    v_exec_id := NEW.execution_id;
  END IF;

  SELECT executed_qty INTO v_executed_qty
  FROM public.weekly_plan_item_executions
  WHERE id = v_exec_id;

  IF v_executed_qty IS NULL THEN
    RAISE EXCEPTION 'La ejecución % no existe.', v_exec_id;
  END IF;

  SELECT COALESCE(SUM(cantidad_consumida), 0) INTO v_total_consumed
  FROM public.acta_item_sources
  WHERE execution_id = v_exec_id;

  IF v_total_consumed > v_executed_qty THEN
    RAISE EXCEPTION 'Sobrefacturación detectada para la ejecución %: suma facturada (%) supera la cantidad ejecutada (%).',
      v_exec_id, v_total_consumed, v_executed_qty;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trig_check_acta_item_source_overbilling ON public.acta_item_sources;

CREATE CONSTRAINT TRIGGER trig_check_acta_item_source_overbilling
  AFTER INSERT OR UPDATE ON public.acta_item_sources
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_acta_item_source_overbilling();

COMMENT ON FUNCTION public.fn_check_acta_item_source_overbilling() IS
  'Trigger de protección que impide que la suma consumida de una ejecución en acta_item_sources supere su executed_qty. Ver ADR-0003.';
