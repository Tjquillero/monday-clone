-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.4: Publicación Realtime y Contrato de Canal
-- ============================================================================
-- Propósito: Verificar la inclusión de `public.user_notifications` en la publicación
-- de base de datos `supabase_realtime` y documentar la arquitectura de entrega
-- WebSocket e integración con React Query.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PASO 1: Verificación de Inclusión en la Publicación supabase_realtime
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'M5-E1.4 FALLÓ: Tabla user_notifications no pertenece a la publicación supabase_realtime';
  END IF;

  RAISE NOTICE 'M5-E1.4 PASS: Tabla user_notifications verificada en publicación supabase_realtime';
END;
$$;

-- Consulta de catálogo comprobable
SELECT 
  pubname, 
  schemaname, 
  tablename,
  'Habilitado para transmisión de eventos WAL via WebSocket' AS estado_realtime
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'user_notifications';

-- ----------------------------------------------------------------------------
-- PASO 2: Contrato del Canal Supabase Realtime (useRealtimeNotifications.ts)
-- ----------------------------------------------------------------------------
-- Topología de Entrega:
-- PostgreSQL INSERT -> Write Ahead Log (WAL) -> Supabase Realtime Server
-- -> WebSocket Channel `notifications:user:<userId>` (Filter `user_id=eq.<userId>`)
-- -> Hook React Query invalidación de caché e inserción en Inbox UI.
SELECT 
  'notifications:user:<userId>' AS canal_websocket,
  'postgres_changes (INSERT)' AS evento_escuchado,
  'user_id=eq.<userId>' AS filtro_aislamiento,
  'Consulta durable inicial al cargar / reconectar' AS fallback_durable;
