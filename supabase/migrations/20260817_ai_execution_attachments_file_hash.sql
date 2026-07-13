-- =============================================================================
-- get_execution_attachments() — agrega file_hash al DTO, para v2.4b
-- (comparación de posibles duplicados visuales). Mismo motivo que la
-- migración de `phase` (20260813): cambiar las columnas de RETURNS TABLE
-- sin tocar los parámetros no es un CREATE OR REPLACE válido — DROP primero.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_execution_attachments(UUID);

CREATE FUNCTION public.get_execution_attachments(p_execution_id UUID)
RETURNS TABLE(
  file_url  TEXT,
  file_name TEXT,
  file_type TEXT,
  phase     TEXT,
  file_hash TEXT
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
  SELECT ea.file_url, ea.file_name, ea.file_type, ea.phase, ea.file_hash
  FROM public.execution_attachments ea
  WHERE ea.execution_id = p_execution_id
  ORDER BY ea.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.get_execution_attachments(UUID) IS
  'DTO estable para los tools de IA evaluate_execution_evidence, compare_before_after_evidence y find_possible_visual_duplicates: fotos (file_url/file_name/file_type/phase/file_hash) de una ejecución, con verificación explícita de acceso al board.';
