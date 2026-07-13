-- =============================================================================
-- IA — get_execution_attachments(): lookup autorizado de fotos de una
-- ejecución, para v2.2 de Fase 5 (evaluate_execution_evidence). Mismo patrón
-- que el resto de RPCs de IA: RPC con verificación explícita de acceso, en
-- vez de confiar únicamente en RLS de storage/tablas (defensa en
-- profundidad, consistente con las 8 tools anteriores).
--
-- No introduce ninguna regla nueva: solo expone execution_attachments ya
-- existente (20260716_execution_attachments.sql), con la misma cadena de
-- autorización (execution -> plan_item -> plan -> board) que ya usan sus
-- propias políticas RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_execution_attachments(p_execution_id UUID)
RETURNS TABLE(
  file_url  TEXT,
  file_name TEXT,
  file_type TEXT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_id UUID;
BEGIN
  SELECT wp.board_id INTO v_board_id
  FROM public.weekly_plan_item_executions e
  JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
  JOIN public.weekly_plans wp ON wp.id = i.plan_id
  WHERE e.id = p_execution_id;

  IF v_board_id IS NULL OR get_user_board_role(v_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a esta ejecución.';
  END IF;

  RETURN QUERY
  SELECT ea.file_url, ea.file_name, ea.file_type
  FROM public.execution_attachments ea
  WHERE ea.execution_id = p_execution_id
  ORDER BY ea.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_execution_attachments(UUID) IS
  'DTO estable para el tool de IA evaluate_execution_evidence: fotos (file_url/file_name/file_type) de una ejecución, con verificación explícita de acceso al board.';
