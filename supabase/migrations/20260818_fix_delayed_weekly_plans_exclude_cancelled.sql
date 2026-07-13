-- =============================================================================
-- Fix — get_delayed_weekly_plans(): excluir también 'cancelled'.
--
-- BUG (encontrado en /code-review ultra del Copiloto de IA): la condición
-- original solo excluía status = 'closed'. Pero 'cancelled' es un estado
-- terminal DISTINTO y válido (weekly_plans.status CHECK incluye
-- 'cancelled', ver 20260709_weekly_plans_nucleus.sql) que significa "plan
-- abortado" — un plan cancelado antes de que terminara su semana nunca fue
-- ni será ejecutado, así que no tiene sentido reportarlo como "atrasado".
--
-- Firma y RETURNS TABLE sin cambios -> CREATE OR REPLACE alcanza, no hace
-- falta DROP FUNCTION.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_delayed_weekly_plans(p_board_id UUID)
RETURNS TABLE(
  weekly_plan_id UUID,
  board_id       UUID,
  week_start     DATE,
  week_end       DATE,
  status         TEXT,
  activity_code  TEXT,
  activity_name  TEXT,
  zone_name      TEXT,
  days_late      INT
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
    wp.id,
    wp.board_id,
    wp.week_start,
    (wp.week_start + INTERVAL '6 days')::DATE,
    wp.status,
    i.activity_key,
    COALESCE(bas.name, i.activity_key),
    g.title,
    (CURRENT_DATE - (wp.week_start + INTERVAL '6 days')::DATE)::INT
  FROM public.weekly_plans wp
  JOIN public.weekly_plan_items i ON i.plan_id = wp.id
  JOIN public.groups g ON g.id = wp.group_id
  LEFT JOIN public.board_activity_standards bas
    ON  bas.board_id     = wp.board_id
    AND bas.activity_key = i.activity_key
    AND bas.effective_to IS NULL
  WHERE wp.board_id = p_board_id
    AND (wp.week_start + INTERVAL '6 days')::DATE < CURRENT_DATE
    AND wp.status NOT IN ('closed', 'cancelled')
  ORDER BY wp.week_start ASC, i.planned_sequence ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_delayed_weekly_plans(UUID) IS
  'DTO estable para el tool de IA get_delayed_weekly_plans: planes semanales cuya semana ya terminó pero no llegaron a estado closed ni cancelled, una fila por actividad dentro de cada plan atrasado. "Retrasado" se mide sobre el compromiso semanal, no sobre la actividad contractual del POA (que no tiene fecha de vencimiento). Un plan cancelado fue abortado deliberadamente -- nunca fue ni será ejecutado, así que no es "atraso".';
