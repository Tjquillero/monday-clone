-- =============================================================================
-- IA — get_executions_without_evidence(): v2.1 de Fase 5 (visión por
-- computador) — el paso de dominio ANTES de cualquier análisis visual.
--
-- CONTRATO (congelado con el usuario antes de implementar):
--   Reutiliza LITERALMENTE la misma condición que ya existe en el dominio
--   (Gate 2 de confirm_weekly_plan, MEVID — supabase/migrations/
--   20260717_confirm_plan_evidence_gate.sql): ejecuciones en estado
--   'verified' sin ninguna fila en execution_attachments. No es una regla
--   nueva — es la misma, extendida a nivel de board (no solo un plan
--   puntual) para consulta proactiva antes de intentar confirmar, y para
--   detectar el caso post-confirmación (alguien borra la única evidencia
--   de una ejecución ya verificada en un plan ya confirmado — Gate 2 no
--   puede atraparlo porque ya pasó).
--
--   No decide nada, no bloquea nada — a diferencia de Gate 2 (que si
--   impide confirmar), este tool solo informa. La decisión de qué hacer
--   con esa jornada sigue siendo humana.
--
--   Incluye plan_status para que el modelo pueda distinguir "todavía en
--   borrador, evidencia pendiente de subir" de "plan ya confirmado, la
--   evidencia desapareció después" — son situaciones operativas distintas
--   aunque compartan la misma condición SQL.
--
--   LIMIT 200 — mismo criterio defensivo que get_delayed_weekly_plans.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_executions_without_evidence(p_board_id UUID)
RETURNS TABLE(
  execution_id   UUID,
  weekly_plan_id UUID,
  activity_key   TEXT,
  activity_name  TEXT,
  zone_name      TEXT,
  execution_date DATE,
  plan_status    TEXT
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
    e.id,
    wp.id,
    i.activity_key,
    COALESCE(bas.name, i.activity_key),
    g.title,
    e.execution_date,
    wp.status
  FROM public.weekly_plan_item_executions e
  JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
  JOIN public.weekly_plans wp ON wp.id = i.plan_id
  JOIN public.groups g ON g.id = wp.group_id
  LEFT JOIN public.board_activity_standards bas
    ON  bas.board_id     = wp.board_id
    AND bas.activity_key = i.activity_key
    AND bas.effective_to IS NULL
  WHERE wp.board_id = p_board_id
    AND e.status = 'verified'
    AND NOT EXISTS (
      SELECT 1 FROM public.execution_attachments ea WHERE ea.execution_id = e.id
    )
  ORDER BY e.execution_date ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_executions_without_evidence(UUID) IS
  'DTO estable para el tool de IA get_executions_without_evidence: ejecuciones verified sin ninguna fila en execution_attachments. Misma condición exacta que el Gate 2 (MEVID) de confirm_weekly_plan, extendida a nivel de board. No bloquea nada — solo informa; la decisión sigue siendo humana.';
