-- Migration: Fase 4 · Módulo 5 — Read Model user_notifications y Dispatcher RPC
-- Baseline Rectora: v5.0 GO DOCUMENTAL (101 suites / 746 tests -> 102 suites / 768 tests)

-- 1. Tabla soberana de roles por tablero (si no existe)
CREATE TABLE IF NOT EXISTS public.user_board_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  role text NOT NULL, -- 'SUPERVISOR' | 'DIRECTOR' | 'ADMIN' | 'VERIFIER' | 'HR_ADMIN'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_board_roles_unique UNIQUE (user_id, board_id, role)
);

-- 2. Read Model / Inbox Projection durable: user_notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  notification_dedup_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  board_id uuid NOT NULL,
  alert_code text NOT NULL,
  entity_id text NOT NULL,
  severity text NOT NULL, -- 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO'
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);

-- Índices de consulta optimizada
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON public.user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_is_read ON public.user_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_notifications_board_id ON public.user_notifications(board_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON public.user_notifications(created_at DESC);

-- 3. M5-SEC.1: Restricción absoluta de permisos de tabla SQL
REVOKE ALL ON public.user_notifications FROM PUBLIC, authenticated;
GRANT SELECT ON public.user_notifications TO authenticated;

-- Permisos sobre user_board_roles
GRANT SELECT ON public.user_board_roles TO authenticated;

-- RLS Habilitado en user_notifications
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
CREATE POLICY user_notifications_select_own ON public.user_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- RLS Habilitado en user_board_roles
ALTER TABLE public.user_board_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_board_roles_select_own ON public.user_board_roles;
CREATE POLICY user_board_roles_select_own ON public.user_board_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4. Única vía autenticada de lectura -> leído: mark_notification_read RPC
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.user_notifications
  SET is_read = true, read_at = NOW()
  WHERE id = p_notification_id AND user_id = auth.uid() AND is_read = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

-- 5. RPC Pasarela de Despacho Seguro: dispatch_user_notification
CREATE OR REPLACE FUNCTION public.dispatch_user_notification(
  p_event_id text,
  p_board_id uuid,
  p_alert_code text,
  p_entity_id text,
  p_severity text,
  p_title text,
  p_message text,
  p_eligible_roles text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_inserted_count integer := 0;
  v_recipient record;
  v_dedup_key text;
BEGIN
  -- Iterar por usuarios autorizados con rol elegible e is_active = true en el board_id
  FOR v_recipient IN
    SELECT DISTINCT user_id
    FROM public.user_board_roles
    WHERE board_id = p_board_id
      AND is_active = true
      AND role = ANY(p_eligible_roles)
  LOOP
    v_dedup_key := v_recipient.user_id || '__' || p_event_id;

    INSERT INTO public.user_notifications (
      event_id,
      notification_dedup_key,
      user_id,
      board_id,
      alert_code,
      entity_id,
      severity,
      title,
      message,
      is_read,
      created_at
    )
    VALUES (
      p_event_id,
      v_dedup_key,
      v_recipient.user_id,
      p_board_id,
      p_alert_code,
      p_entity_id,
      p_severity,
      p_title,
      p_message,
      false,
      NOW()
    )
    ON CONFLICT (notification_dedup_key) DO NOTHING;

    IF FOUND THEN
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_user_notification(text, uuid, text, text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_user_notification(text, uuid, text, text, text, text, text, text[]) TO authenticated;

-- 6. Habilitación de Supabase Realtime para la tabla Read Model user_notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Ignorar únicamente si la tabla ya fue agregada previamente a la publicación
END;
$$;
