-- =============================================================================
-- Fix — get_board_operational_agenda(): "semana vigente" desaparecía en fin
-- de semana.
--
-- BUG (tarea #64, encontrado 2026-07-19): `current_week_plans` filtraba con
--   wp.week_start <= v_date AND wp.week_start + 4 >= v_date
-- es decir, exigía que v_date (hoy) cayera LITERALMENTE entre lunes y
-- viernes de esa semana. Cualquier sábado o domingo esa condición es falsa
-- para CUALQUIER plan de la semana laboral en curso, sin importar si está
-- published/in_progress/confirmed — site_semaphore quedaba vacío y la
-- Agenda mostraba "Ningún sitio tiene un plan activo esta semana" de forma
-- engañosa, aunque sí existiera un plan activo.
--
-- No es un desfase entre el estado del plan y la consulta (no compiten dos
-- verdades) — es un defecto real en la definición de la ventana temporal.
-- ready_to_confirm/ready_to_close no tienen este filtro y nunca estuvieron
-- afectados.
--
-- FIX: calcular la semana ISO (lunes) que CONTIENE a v_date, en vez de
-- exigir que v_date caiga dentro del rango — mismo patrón ya usado en
-- get_board_operational_agenda_week (20260822_board_operational_agenda_week.sql):
--   v_week_start := v_date - (EXTRACT(ISODOW FROM v_date)::INT - 1);
--   ... WHERE wp.week_start = v_week_start
-- Un supervisor debe poder revisar la semana que termina aunque la abra en
-- fin de semana.
--
-- CREATE OR REPLACE alcanza aquí: misma firma (UUID, DATE), solo cambia el
-- cuerpo.
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
  v_date       DATE := COALESCE(p_date, (now() AT TIME ZONE 'America/Bogota')::DATE);
  v_week_start DATE := v_date - (EXTRACT(ISODOW FROM v_date)::INT - 1);
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
      AND  wp.week_start = v_week_start
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
  'Resumen de solo lectura para la Agenda Operativa (vista Hoy): conteos del dia (America/Bogota), planes listos para confirmar/cerrar (mismos gates de confirm_weekly_plan/close_weekly_plan) y semaforo de cumplimiento por sitio de la semana vigente (lunes-viernes, calculada como la semana ISO que contiene a p_date -- v_date - (ISODOW-1) -- no como un rango que exige que p_date caiga dentro de el; corregido 2026-07-19, tarea #64). No valida ni transiciona nada.';
