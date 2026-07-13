-- =============================================================================
-- IA — get_execution_summary(): estado de certificaciones de un board.
--
-- CONTRATO: cuenta weekly_plan_item_executions por status, usando
-- exactamente los 3 estados ya congelados en docs/domain/workflow.md
-- (reported -> verified | rejected, ambos terminales) — ninguna definición
-- de dominio nueva aquí, solo agregación de un enum ya existente.
--
--   reported: reportadas por el líder, pendientes de revisión del
--             supervisor (el "backlog" real de verificación).
--   verified: aprobadas por el supervisor.
--   rejected: observadas por el supervisor (terminal — la corrección es
--             una ejecución NUEVA, no se reabre esta).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_execution_summary(p_board_id UUID)
RETURNS TABLE(
  board_id UUID,
  reported INT,
  verified INT,
  rejected INT,
  total    INT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  RETURN QUERY
  SELECT
    p_board_id,
    COUNT(*) FILTER (WHERE e.status = 'reported')::INT,
    COUNT(*) FILTER (WHERE e.status = 'verified')::INT,
    COUNT(*) FILTER (WHERE e.status = 'rejected')::INT,
    COUNT(*) FILTER (WHERE e.status IN ('reported', 'verified', 'rejected'))::INT
  FROM public.weekly_plan_item_executions e
  JOIN public.weekly_plan_items i  ON i.id  = e.plan_item_id
  JOIN public.weekly_plans      wp ON wp.id = i.plan_id
  WHERE wp.board_id = p_board_id;
END;
$$;

COMMENT ON FUNCTION public.get_execution_summary(UUID) IS
  'DTO estable para el tool de IA get_execution_summary: cuántas ejecuciones de un board están reported (pendientes de verificar), verified o rejected. Usa exactamente los estados ya congelados en docs/domain/workflow.md, sin definir nada nuevo.';
