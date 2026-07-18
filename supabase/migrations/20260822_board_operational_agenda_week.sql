-- =============================================================================
-- get_board_operational_agenda_week — resumen de solo lectura para la Agenda
-- Operativa (Fase 2 / vista Semana). Ver docs/architecture/
-- agenda-operativa-design.md (sección 12, matriz de aceptación) y ADR-0006.
--
-- Contrato:
--   - SECURITY INVOKER (no DEFINER): se apoya en la RLS ya existente de
--     weekly_plans/weekly_plan_items/weekly_plan_item_executions/groups.
--     A diferencia de get_board_operational_agenda (Fase 1), esta función NO
--     tiene ninguna llamada anidada a una función DEFINER que aporte
--     autorización "gratis" — el chequeo de get_user_board_role es explícito
--     aquí, mismo mensaje ya usado en get_executions_without_evidence.
--   - "Semana vigente" = lunes a viernes, mismo contrato EXACTO de
--     getMonday()/getWeekBounds() en weeklyPlanner.ts — NUNCA 7 días. Se
--     resuelve con EXTRACT(ISODOW FROM p_date), no con week_start+6.
--   - "Hoy" (p_date) se resuelve en America/Bogota si no se pasa explícito,
--     mismo patron ya aplicado en get_board_operational_agenda y en
--     get_delayed_weekly_plans.
--   - has_activity por día = "¿qué días quedaron sin trabajo?" (pregunta de
--     la sección 5 del diseño) respondida directamente, sin inventar un
--     color por día — el semáforo (verde/ambar/rojo) es a nivel de semana
--     completa (pct_verified_week), para no sobre-interpretar un solo día
--     con pocas jornadas.
--   - Sin gates: a diferencia de ready_to_confirm/ready_to_close (Fase 1),
--     aquí no se filtra por si el plan puede confirmarse — se listan todos
--     los planes activos de la semana (published/in_progress/confirmed),
--     es solo lectura de actividad, no una decisión de negocio.
--   - No modifica get_board_operational_agenda, confirm_weekly_plan,
--     close_weekly_plan, generate_acta_draft ni get_executions_without_evidence.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_board_operational_agenda_week(
  p_board_id UUID,
  p_date     DATE DEFAULT NULL
)
RETURNS TABLE (
  week_start DATE,
  week_end   DATE,
  site_weeks JSONB
)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_date       DATE := COALESCE(p_date, (now() AT TIME ZONE 'America/Bogota')::DATE);
  v_week_start DATE;
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  v_week_start := v_date - (EXTRACT(ISODOW FROM v_date)::INT - 1);

  RETURN QUERY
  WITH current_week_plans AS (
    SELECT wp.id AS plan_id, wp.group_id, g.title AS group_title, wp.status AS plan_status
    FROM   public.weekly_plans wp
    JOIN   public.groups g ON g.id = wp.group_id
    WHERE  wp.board_id = p_board_id
      AND  wp.status IN ('published', 'in_progress', 'confirmed')
      AND  wp.week_start = v_week_start
  ),
  board_execs AS (
    SELECT e.id, e.status, e.execution_date, i.plan_id
    FROM   public.weekly_plan_item_executions e
    JOIN   public.weekly_plan_items i ON i.id = e.plan_item_id
    WHERE  i.plan_id IN (SELECT plan_id FROM current_week_plans)
  ),
  week_totals AS (
    SELECT
      cwp.plan_id,
      COALESCE(
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE be.status = 'verified')
          / NULLIF(COUNT(*) FILTER (WHERE be.status IN ('verified', 'reported', 'rejected')), 0)
        , 1),
        0
      ) AS pct_verified_week
    FROM current_week_plans cwp
    LEFT JOIN board_execs be ON be.plan_id = cwp.plan_id
    GROUP BY cwp.plan_id
  ),
  day_offsets AS (
    SELECT generate_series(0, 4) AS day_offset
  ),
  site_days AS (
    SELECT
      cwp.plan_id,
      (v_week_start + d.day_offset) AS day_date,
      EXISTS (
        SELECT 1 FROM board_execs be
        WHERE be.plan_id = cwp.plan_id AND be.execution_date = v_week_start + d.day_offset
      ) AS has_activity
    FROM current_week_plans cwp
    CROSS JOIN day_offsets d
  ),
  site_agg AS (
    SELECT
      plan_id,
      jsonb_agg(jsonb_build_object('date', day_date, 'has_activity', has_activity) ORDER BY day_date) AS days_json
    FROM site_days
    GROUP BY plan_id
  )
  SELECT
    v_week_start,
    v_week_start + 4,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'group_id', cwp.group_id, 'group_title', cwp.group_title, 'plan_id', cwp.plan_id,
         'plan_status', cwp.plan_status,
         'pct_verified_week', wt.pct_verified_week,
         'semaphore', CASE
           WHEN wt.pct_verified_week >= 80 THEN 'green'
           WHEN wt.pct_verified_week >= 50 THEN 'amber'
           ELSE 'red'
         END,
         'days', sa.days_json
       ) ORDER BY cwp.group_title)
       FROM current_week_plans cwp
       JOIN week_totals wt ON wt.plan_id = cwp.plan_id
       JOIN site_agg   sa ON sa.plan_id = cwp.plan_id),
      '[]'::jsonb
    );
END;
$$;

COMMENT ON FUNCTION public.get_board_operational_agenda_week(UUID, DATE) IS
  'Resumen de solo lectura para la Agenda Operativa (vista Semana): por sitio con plan activo en la semana vigente (lunes-viernes), porcentaje verificado de la semana + semaforo, y que dias tuvieron actividad. No valida ni transiciona nada.';
