-- Migration: 2026092901_materialization_events.sql
-- Module: R1-b0 + R1-c Observabilidad Estructurada de Materialización y Persistencia P3
-- Specification: docs/gates/R1-b0_R1-c_SPEC.md v4.2

-- 1. Tabla Append-Only de Eventos de Materialización
CREATE TABLE IF NOT EXISTS public.materialization_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  board_id UUID NOT NULL REFERENCES public.boards(id),
  group_id UUID REFERENCES public.groups(id),
  week_start DATE NOT NULL,
  plan_id UUID REFERENCES public.weekly_plans(id),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED')),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_mat_events_board_week ON public.materialization_events(board_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_mat_events_group ON public.materialization_events(group_id);
CREATE INDEX IF NOT EXISTS idx_mat_events_created_at ON public.materialization_events(created_at DESC);

-- 3. Permisos y Row Level Security (RLS)
REVOKE ALL ON TABLE public.materialization_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.materialization_events TO authenticated;
ALTER TABLE public.materialization_events ENABLE ROW LEVEL SECURITY;

-- 4. Política de Lectura Exclusiva para Administradores (E-Q18a / E-Q18c)
DROP POLICY IF EXISTS "Admin Select Only" ON public.materialization_events;
CREATE POLICY "Admin Select Only" ON public.materialization_events 
  FOR SELECT TO authenticated 
  USING (public.get_user_board_role(board_id, auth.uid()) = 'admin');

-- 5. RPC SECURITY DEFINER para Inserción Segura de Eventos de Materialización
CREATE OR REPLACE FUNCTION public.log_materialization_event_rpc(
  p_board_id UUID,
  p_group_id UUID,
  p_week_start DATE,
  p_plan_id UUID,
  p_event_type TEXT,
  p_status TEXT,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_event_id TEXT;
  v_new_id UUID;
BEGIN
  -- 5.1 Validar autenticación
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: must be authenticated to log materialization events';
  END IF;

  -- 5.2 Validar permiso de ejecución sobre el tablero
  IF NOT public.can_report_execution(p_board_id, v_actor_id) THEN
    RAISE EXCEPTION 'Forbidden: user % cannot report execution on board %', v_actor_id, p_board_id;
  END IF;

  -- 5.3 Validar pertenencia del grupo al tablero (si group_id no es nulo; D10 permite group_id nulo para MISSING_GROUP_ID)
  IF p_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.groups g 
      WHERE g.id = p_group_id AND g.board_id = p_board_id
    ) THEN
      RAISE EXCEPTION 'Invalid group: group % does not belong to board %', p_group_id, p_board_id;
    END IF;
  END IF;

  -- 5.4 Validar pertenencia del plan al tablero/grupo si viene especificado
  IF p_plan_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.weekly_plans wp 
      WHERE wp.id = p_plan_id 
        AND wp.board_id = p_board_id
        AND (p_group_id IS NULL OR wp.group_id = p_group_id)
    ) THEN
      RAISE EXCEPTION 'Invalid plan: weekly_plan % does not belong to board % and group %', p_plan_id, p_board_id, p_group_id;
    END IF;
  END IF;

  -- 5.5 Validar event_type contra lista blanca
  IF p_event_type NOT IN (
    'SITE_MATERIALIZATION_SUMMARY',
    'SEQUENCE_IDENTITY_CONFLICT',
    'WEEKLY_PLAN_ITEMS_GATEWAY_DROPPED'
  ) THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;

  -- 5.6 Validar status
  IF p_status NOT IN ('SUCCESS', 'PARTIAL', 'FAILED') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- 5.7 Validar tamaño del payload (máximo 64 KB en texto JSON)
  IF octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'Payload size exceeds 64KB limit: % bytes', octet_length(p_payload::text);
  END IF;

  -- 5.8 Generar identificador de evento único
  v_event_id := COALESCE(
    p_payload->>'event_id',
    'mat-' || p_week_start::text || '-' || COALESCE(p_group_id::text, 'global') || '-' || gen_random_uuid()::text
  );

  -- 5.9 Inserción append-only asignando actor_id en servidor
  INSERT INTO public.materialization_events (
    event_id,
    event_type,
    board_id,
    group_id,
    week_start,
    plan_id,
    status,
    actor_id,
    payload,
    created_at
  ) VALUES (
    v_event_id,
    p_event_type,
    p_board_id,
    p_group_id,
    p_week_start,
    p_plan_id,
    p_status,
    v_actor_id,
    p_payload,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- 6. Revocar ejecución pública y dar permiso solo a authenticated
REVOKE EXECUTE ON FUNCTION public.log_materialization_event_rpc(UUID, UUID, DATE, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_materialization_event_rpc(UUID, UUID, DATE, UUID, TEXT, TEXT, JSONB) TO authenticated;
