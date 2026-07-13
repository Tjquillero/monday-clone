-- =============================================================================
-- Fix — get_delayed_weekly_plans(): día de negocio en America/Bogota, no UTC.
--
-- BUG (encontrado en /code-review ultra del Copiloto de IA, confirmado por
-- reproducción determinística): CURRENT_DATE se evalúa en la zona horaria de
-- la SESIÓN de Postgres, que en este proyecto es UTC (confirmado con
-- `SHOW timezone` contra la base enlazada) -- no America/Bogota, la zona de
-- negocio que ya se usa en el resto de la app (ej. PhotoVerificationModal.tsx
-- usa 'America/Bogota' explícitamente para timestamps de evidencia).
--
-- Reproducción determinística (independiente del reloj real):
--   ('2026-07-14 02:00:00+00'::timestamptz AT TIME ZONE 'America/Bogota')::date
--   = '2026-07-13' (no '2026-07-14')
-- Es decir: entre las 19:00 y las 23:59 hora de Bogotá, CURRENT_DATE en UTC
-- ya rodó al día siguiente. Un weekly_plan cuya semana termina "hoy" en
-- Bogotá podía marcarse como atrasado (y con days_late ya incrementado)
-- hasta 5 horas antes de la medianoche local.
--
-- Se agrega p_reference_instant (opcional, default now()) EXCLUSIVAMENTE
-- para poder escribir un test pgTAP determinístico que fuerce ese instante
-- exacto -- ningún llamador real (el tool de IA solo pasa p_board_id) se ve
-- afectado; el comportamiento en producción es idéntico (usa now() real).
-- =============================================================================

-- CREATE OR REPLACE no alcanza aquí: se agrega un parámetro nuevo, así que
-- Postgres lo trataría como un overload en vez de un reemplazo (misma
-- lección que las migraciones de get_execution_attachments) -- DROP
-- explícito de la firma anterior antes de crear la nueva.
DROP FUNCTION IF EXISTS public.get_delayed_weekly_plans(UUID);

CREATE OR REPLACE FUNCTION public.get_delayed_weekly_plans(
  p_board_id UUID,
  p_reference_instant TIMESTAMPTZ DEFAULT now()
)
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
DECLARE
  v_today DATE;
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  -- Día de negocio: America/Bogota, no el de la sesión de Postgres (UTC).
  v_today := (p_reference_instant AT TIME ZONE 'America/Bogota')::DATE;

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
    (v_today - (wp.week_start + INTERVAL '6 days')::DATE)::INT
  FROM public.weekly_plans wp
  JOIN public.weekly_plan_items i ON i.plan_id = wp.id
  JOIN public.groups g ON g.id = wp.group_id
  LEFT JOIN public.board_activity_standards bas
    ON  bas.board_id     = wp.board_id
    AND bas.activity_key = i.activity_key
    AND bas.effective_to IS NULL
  WHERE wp.board_id = p_board_id
    AND (wp.week_start + INTERVAL '6 days')::DATE < v_today
    AND wp.status NOT IN ('closed', 'cancelled')
  ORDER BY wp.week_start ASC, i.planned_sequence ASC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_delayed_weekly_plans(UUID, TIMESTAMPTZ) IS
  'DTO estable para el tool de IA get_delayed_weekly_plans: planes semanales cuya semana ya terminó (medida en el día de negocio, America/Bogota) pero no llegaron a estado closed ni cancelled, una fila por actividad dentro de cada plan atrasado. p_reference_instant es opcional (default now()), solo para pruebas determinísticas -- el tool de IA siempre usa el valor real.';
