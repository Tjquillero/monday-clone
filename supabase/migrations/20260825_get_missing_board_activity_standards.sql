-- =============================================================================
-- get_missing_board_activity_standards — fuente única de verdad para
-- "¿qué actividades contratadas de esta versión del POA no tienen
-- configuración técnica todavía?"
-- Ref: docs/architecture/poa-technical-catalog-decoupling.md, Decisión 2.
--
-- Contrato:
--   - SECURITY INVOKER (no DEFINER): no se apoya en ninguna llamada anidada
--     a una función DEFINER — el chequeo de get_user_board_role es
--     explícito aquí, mismo patrón que get_board_operational_agenda_week.
--   - Compara poa_activities (fase contractual: lo que el board contrató en
--     esta versión) contra board_activity_standards (fase técnica: lo que
--     tiene rendimiento configurado para ese board) — activity_key que
--     aparece en la primera pero no en la segunda (vigente, effective_to
--     IS NULL) es "pendiente de configuración técnica".
--   - Ni el importador de POA ni esta función escriben nada — es de solo
--     lectura, consumida por el Scheduler antes de generar el Cronograma
--     (ver useWeeklyPlan.ts) y por la pantalla de resultado de importación.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_missing_board_activity_standards(
  p_board_id       UUID,
  p_poa_version_id UUID
)
RETURNS TABLE (
  activity_key TEXT,
  description  TEXT,
  unit         TEXT
)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  RETURN QUERY
  SELECT pa.activity_key, pa.description, pa.unit
  FROM public.poa_activities pa
  WHERE pa.poa_version_id = p_poa_version_id
    AND NOT EXISTS (
      SELECT 1 FROM public.board_activity_standards bas
      WHERE bas.board_id = p_board_id
        AND bas.activity_key = pa.activity_key
        AND bas.effective_to IS NULL
    )
  ORDER BY pa.import_order;
END;
$$;
