-- =============================================================================
-- get_weekly_plan_confirmation_summary — resumen de solo lectura para la
-- pantalla de Confirmación (Cronograma).
--
-- Contrato:
--   - Cuenta las ejecuciones del plan por estado relevante para el gate 1 de
--     confirm_weekly_plan (jornadas 'reported' bloquean; 'draft' no cuenta
--     para nada, mismo criterio que el gate ya usa).
--   - Para las 'reported' (pendientes), devuelve además su nombre de
--     actividad y fecha, resolviendo el nombre EXACTAMENTE igual que el
--     gate de evidencia (Gate 2) de confirm_weekly_plan:
--     COALESCE(board_activity_standards.name, activity_key) — mismo join,
--     mismo criterio de vigencia (effective_to IS NULL). Ver
--     20260717_confirm_plan_evidence_gate.sql.
--   - SECURITY INVOKER (no DEFINER): esta función no necesita bypassear RLS,
--     solo evita repetir en TypeScript los mismos joins que ya hace el
--     dominio en SQL. Las políticas SELECT de weekly_plans/weekly_plan_items/
--     weekly_plan_item_executions/board_activity_standards ya permiten leer
--     a cualquier miembro del board (get_user_board_role IS NOT NULL) — el
--     mismo alcance que hoy tienen las queries planas de useVerificationQueue
--     / usePublishedWeekPlans.
--   - No repite ni reemplaza la lógica de confirm_weekly_plan: es un resumen
--     informativo para que la UI decida si mostrar el botón habilitado, no
--     una fuente de verdad alternativa. confirm_weekly_plan sigue siendo
--     quien valida y transiciona.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_weekly_plan_confirmation_summary(p_plan_id UUID)
RETURNS TABLE (
  verified_count INT,
  rejected_count INT,
  pending_count INT,
  pending_executions JSONB
)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_id UUID;
BEGIN
  SELECT board_id INTO v_board_id FROM public.weekly_plans WHERE id = p_plan_id;
  IF v_board_id IS NULL THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;

  RETURN QUERY
  WITH execs AS (
    SELECT e.id, e.status, e.execution_date, i.activity_key
    FROM   public.weekly_plan_item_executions e
    JOIN   public.weekly_plan_items           i ON i.id = e.plan_item_id
    WHERE  i.plan_id = p_plan_id
  ),
  pending AS (
    SELECT
      COALESCE(bas.name, ex.activity_key) AS activity_name,
      ex.execution_date
    FROM   execs ex
    LEFT JOIN public.board_activity_standards bas
      ON   bas.board_id     = v_board_id
      AND  bas.activity_key = ex.activity_key
      AND  bas.effective_to IS NULL
    WHERE  ex.status = 'reported'
    ORDER BY COALESCE(bas.name, ex.activity_key), ex.execution_date
  )
  SELECT
    (SELECT COUNT(*) FROM execs WHERE status = 'verified')::INT,
    (SELECT COUNT(*) FROM execs WHERE status = 'rejected')::INT,
    (SELECT COUNT(*) FROM execs WHERE status = 'reported')::INT,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'activity_name',  p.activity_name,
         'execution_date', p.execution_date
       )) FROM pending p),
      '[]'::jsonb
    );
END;
$$;

COMMENT ON FUNCTION public.get_weekly_plan_confirmation_summary(UUID) IS
  'Resumen de solo lectura para la pantalla de Confirmación: conteo de ejecuciones verified/rejected/reported del plan + lista de jornadas reported (nombre de actividad + fecha), mismo criterio de resolución de nombre que el Gate 2 de confirm_weekly_plan. No valida ni transiciona nada — confirm_weekly_plan sigue siendo la única fuente de verdad para permitir o bloquear la confirmación.';
