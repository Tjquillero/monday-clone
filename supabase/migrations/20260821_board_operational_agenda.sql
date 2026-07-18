-- =============================================================================
-- get_board_operational_agenda — resumen de solo lectura para la Agenda
-- Operativa (Fase 1 / MVP, vista "Hoy"). Ver docs/architecture/
-- agenda-operativa-design.md y ADR-0006.
--
-- Contrato:
--   - SECURITY INVOKER (no DEFINER): se apoya en la RLS ya existente de
--     weekly_plans/weekly_plan_items/weekly_plan_item_executions/groups —
--     mismo alcance de lectura que ya tienen las queries planas de
--     useVerificationQueue/usePublishedWeekPlans. No escala privilegios.
--   - "Hoy" se resuelve en America/Bogota, no en la sesión de Postgres
--     (UTC) — mismo bug ya corregido una vez en get_delayed_weekly_plans
--     (20260819_fix_delayed_weekly_plans_bogota_timezone.sql). p_date es
--     opcional y solo existe para poder fijarlo en los tests.
--   - "Semana vigente" = lunes a viernes (week_start .. week_start+4),
--     el mismo contrato de getWeekBounds() en weeklyPlanner.ts — NO una
--     semana ISO de 7 días.
--   - missing_evidence_count reutiliza get_executions_without_evidence()
--     tal cual (llamada directa, nunca reimplementa su criterio). Esa
--     función es SECURITY DEFINER con su propio chequeo de autorización
--     ("No tiene acceso a este board.") — como esta función SIEMPRE la
--     invoca para calcular missing_evidence_count, un no-miembro recibe
--     ese mismo error sin necesidad de un chequeo de rol adicional aquí.
--   - ready_to_confirm reproduce exactamente el Gate 1 (sin 'reported'
--     pendientes) y el Gate 2 (sin 'verified' sin evidencia, vía
--     get_executions_without_evidence) de confirm_weekly_plan — nunca
--     decide nada, solo informa qué planes ya los cumplirían.
--   - ready_to_close: único requisito de close_weekly_plan es
--     status = 'confirmed', sin gate adicional.
--   - site_semaphore: mismos umbrales ya validados en DailyAgendaPanel
--     (>=80% verde, >=50% ambar, <50% rojo), un elemento por plan activo
--     de la semana vigente (published/in_progress/confirmed).
--   - No modifica confirm_weekly_plan/close_weekly_plan/generate_acta_draft/
--     get_executions_without_evidence/get_weekly_plan_confirmation_summary.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_board_operational_agenda(
  p_board_id UUID,
  p_date     DATE DEFAULT NULL
)
RETURNS TABLE (
  reported_today_count       INT,
  verified_today_count       INT,
  pending_verification_count INT,
  missing_evidence_count     INT,
  ready_to_confirm           JSONB,
  ready_to_close             JSONB,
  site_semaphore             JSONB
)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_date DATE := COALESCE(p_date, (now() AT TIME ZONE 'America/Bogota')::DATE);
BEGIN
  RETURN QUERY
  WITH board_execs AS (
    SELECT e.id, e.status, e.execution_date, i.plan_id
    FROM   public.weekly_plan_item_executions e
    JOIN   public.weekly_plan_items i  ON i.id  = e.plan_item_id
    JOIN   public.weekly_plans      wp ON wp.id = i.plan_id
    WHERE  wp.board_id = p_board_id
  ),
  missing_evidence AS (
    SELECT execution_id, weekly_plan_id
    FROM   public.get_executions_without_evidence(p_board_id)
  ),
  candidate_confirm AS (
    SELECT wp.id AS plan_id, wp.group_id, g.title AS group_title
    FROM   public.weekly_plans wp
    JOIN   public.groups g ON g.id = wp.group_id
    WHERE  wp.board_id = p_board_id
      AND  wp.status IN ('published', 'in_progress')
      AND  NOT EXISTS (
             SELECT 1 FROM board_execs be
             WHERE be.plan_id = wp.id AND be.status = 'reported'
           )
      AND  NOT EXISTS (
             SELECT 1 FROM missing_evidence me WHERE me.weekly_plan_id = wp.id
           )
  ),
  candidate_close AS (
    SELECT wp.id AS plan_id, wp.group_id, g.title AS group_title
    FROM   public.weekly_plans wp
    JOIN   public.groups g ON g.id = wp.group_id
    WHERE  wp.board_id = p_board_id
      AND  wp.status = 'confirmed'
  ),
  current_week_plans AS (
    SELECT wp.id AS plan_id, wp.group_id, g.title AS group_title, wp.status AS plan_status
    FROM   public.weekly_plans wp
    JOIN   public.groups g ON g.id = wp.group_id
    WHERE  wp.board_id = p_board_id
      AND  wp.status IN ('published', 'in_progress', 'confirmed')
      AND  wp.week_start <= v_date
      AND  wp.week_start + 4 >= v_date
  ),
  semaphore AS (
    SELECT
      cwp.group_id, cwp.group_title, cwp.plan_id, cwp.plan_status,
      COALESCE(
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE be.status = 'verified')
          / NULLIF(COUNT(*) FILTER (WHERE be.status IN ('verified', 'reported', 'rejected')), 0)
        , 1),
        0
      ) AS pct_verified
    FROM current_week_plans cwp
    LEFT JOIN board_execs be ON be.plan_id = cwp.plan_id
    GROUP BY cwp.group_id, cwp.group_title, cwp.plan_id, cwp.plan_status
  )
  SELECT
    (SELECT COUNT(*) FROM board_execs WHERE execution_date = v_date)::INT,
    (SELECT COUNT(*) FROM board_execs WHERE execution_date = v_date AND status = 'verified')::INT,
    (SELECT COUNT(*) FROM board_execs WHERE status = 'reported')::INT,
    (SELECT COUNT(*) FROM missing_evidence)::INT,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'plan_id', plan_id, 'group_id', group_id, 'group_title', group_title
       ) ORDER BY group_title) FROM candidate_confirm),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'plan_id', plan_id, 'group_id', group_id, 'group_title', group_title
       ) ORDER BY group_title) FROM candidate_close),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'group_id', group_id, 'group_title', group_title, 'plan_id', plan_id,
         'plan_status', plan_status, 'pct_verified', pct_verified,
         'semaphore', CASE
           WHEN pct_verified >= 80 THEN 'green'
           WHEN pct_verified >= 50 THEN 'amber'
           ELSE 'red'
         END
       ) ORDER BY group_title) FROM semaphore),
      '[]'::jsonb
    );
END;
$$;

COMMENT ON FUNCTION public.get_board_operational_agenda(UUID, DATE) IS
  'Resumen de solo lectura para la Agenda Operativa (vista Hoy): conteos del dia (America/Bogota), planes listos para confirmar/cerrar (mismos gates de confirm_weekly_plan/close_weekly_plan) y semaforo de cumplimiento por sitio de la semana vigente (lunes-viernes). No valida ni transiciona nada.';
