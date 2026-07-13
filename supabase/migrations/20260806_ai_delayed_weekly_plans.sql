-- =============================================================================
-- IA — get_delayed_weekly_plans(): la pregunta operativa más común
-- ("¿qué actividades están atrasadas?").
--
-- CONTRATO (congelado antes de implementar):
--   "Retrasado" se mide sobre el weekly_plan (compromiso con fecha), NUNCA
--   sobre una actividad del POA (contractual, recurrente, sin fecha de
--   vencimiento — no existe "actividad terminada" en este dominio).
--
--   delayed = week_end < CURRENT_DATE AND status <> 'closed'
--   donde week_end = week_start + 6 días (la semana completa).
--
--   Devuelve una fila por (plan, actividad dentro del plan) — no solo un
--   conteo, para que el modelo tenga contexto real ("la más antigua es de
--   la semana del 12 de mayo, 41 días de retraso"), no una cifra vacía.
--
--   Deliberadamente NO incluye zone_code: groups (las zonas) no tiene un
--   campo "código" en el esquema, solo title — no se inventa uno.
--
--   Concepto DISTINTO, a propósito, de:
--     - get_unverified_executions (trabajo realizado, pendiente de certificar)
--     - get_pending_billable_work (trabajo certificado, pendiente de facturar)
--   Mezclar los tres en un tool obligaría al modelo a explicar 3 conceptos
--   a la vez — mismo criterio que ya separó las funciones del Acta.
--
--   LIMIT 200 filas — defensivo, evita una respuesta desbordada en un board
--   con muchos planes/actividades atrasadas; suficiente para que el modelo
--   sintetice una respuesta útil sin exportar datos masivos.
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
    AND wp.status <> 'closed'
  ORDER BY wp.week_start ASC, i.planned_sequence ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_delayed_weekly_plans(UUID) IS
  'DTO estable para el tool de IA get_delayed_weekly_plans: planes semanales cuya semana ya terminó pero no llegaron a estado closed, una fila por actividad dentro de cada plan atrasado. "Retrasado" se mide sobre el compromiso semanal, no sobre la actividad contractual del POA (que no tiene fecha de vencimiento).';
