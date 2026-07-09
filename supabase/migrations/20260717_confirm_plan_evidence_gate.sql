-- =============================================================================
-- confirm_weekly_plan — gate de evidencia
-- Ref: docs/architecture/execution-certification-design.md, sección 5.
--
-- Contrato:
--   - El gate se evalúa solo sobre ejecuciones en estado 'verified' de este
--     plan (NO 'reported' — el gate anterior ya exige 0 'reported' antes de
--     llegar aquí, así que a este punto nunca queda ninguna en 'reported').
--   - Cada ejecución 'verified' debe tener al menos una fila en
--     execution_attachments. No importa la cantidad, solo la existencia.
--   - 'draft' y 'rejected' no participan: 'draft' nunca se reportó;
--     'rejected' es terminal y no cuenta para el avance (Regla E6,
--     execution-domain.md).
--   - Si falla, se devuelve exactamente qué ejecuciones bloquean (no un
--     mensaje genérico): MESSAGE legible + DETAIL en JSON con
--     {execution_id, activity_key, activity_name} por cada una.
--   - Código de error estructurado ERRCODE = 'MEVID' (Missing EVIDence),
--     para que el cliente distinga este caso de un error de permisos o de
--     concurrencia sin comparar el texto del mensaje.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_weekly_plan(p_plan_id UUID)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan    public.weekly_plans%ROWTYPE;
  v_pending INT;
  v_missing JSONB;
  v_names   TEXT[];
  v_list    TEXT;
BEGIN
  SELECT * INTO v_plan FROM public.weekly_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', p_plan_id;
  END IF;
  IF NOT public.can_manage_weekly_plan(v_plan.board_id, auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores y asistentes pueden confirmar planes.';
  END IF;
  IF v_plan.status NOT IN ('in_progress', 'published') THEN
    RAISE EXCEPTION
      'No se puede confirmar un plan en estado "%". Debe estar in_progress o published.',
      v_plan.status;
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM   public.weekly_plan_item_executions e
  JOIN   public.weekly_plan_items           i ON i.id = e.plan_item_id
  WHERE  i.plan_id = p_plan_id
    AND  e.status  = 'reported';

  IF v_pending > 0 THEN
    RAISE EXCEPTION
      '% ejecución(es) pendiente(s) de verificación. '
      'El supervisor debe verificar o rechazar antes de confirmar el informe.',
      v_pending;
  END IF;

  -- Gate de evidencia: toda ejecución verified debe tener al menos una fila
  -- en execution_attachments. name se resuelve por activity_key contra el
  -- Catálogo Técnico (sin embed de FK, mismo patrón que useVerificationQueue
  -- / usePublishedWeekPlans — aquí es JOIN explícito en SQL, no PostgREST).
  --
  -- Sin DISTINCT en los nombres: si dos ejecuciones distintas comparten
  -- actividad, deben listarse igual como dos jornadas (con su fecha), para
  -- que el conteo del mensaje ("N jornada(s)") siempre coincida con la
  -- cantidad de nombres mostrados.
  SELECT
    jsonb_agg(jsonb_build_object(
      'execution_id',  e.id,
      'activity_key',  i.activity_key,
      'activity_name', COALESCE(bas.name, i.activity_key),
      'execution_date', e.execution_date
    ) ORDER BY COALESCE(bas.name, i.activity_key), e.execution_date),
    array_agg(COALESCE(bas.name, i.activity_key) || ' (' || e.execution_date || ')'
              ORDER BY COALESCE(bas.name, i.activity_key), e.execution_date)
  INTO v_missing, v_names
  FROM   public.weekly_plan_item_executions e
  JOIN   public.weekly_plan_items           i   ON i.id = e.plan_item_id
  LEFT JOIN public.board_activity_standards bas
    ON  bas.board_id     = v_plan.board_id
    AND bas.activity_key = i.activity_key
    AND bas.effective_to IS NULL
  WHERE  i.plan_id = p_plan_id
    AND  e.status  = 'verified'
    AND  NOT EXISTS (
      SELECT 1 FROM public.execution_attachments ea WHERE ea.execution_id = e.id
    );

  IF v_missing IS NOT NULL THEN
    IF array_length(v_names, 1) = 1 THEN
      v_list := v_names[1];
    ELSE
      v_list := array_to_string(v_names[1:array_length(v_names, 1) - 1], ', ') || ' y ' || v_names[array_length(v_names, 1)];
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'MEVID',
      MESSAGE = format(
        'No se puede confirmar el plan semanal porque existen ejecuciones verificadas sin evidencia fotográfica. Faltan evidencias en %s jornada(s): %s.',
        jsonb_array_length(v_missing), v_list
      ),
      DETAIL = v_missing::TEXT;
  END IF;

  UPDATE public.weekly_plans
  SET    status       = 'confirmed',
         confirmed_by = auth.uid(),
         confirmed_at = NOW(),
         updated_by   = auth.uid()
  WHERE  id = p_plan_id;
END;
$$;
