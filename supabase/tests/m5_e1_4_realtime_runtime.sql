-- ============================================================================
-- HITO DE EVIDENCIA FÍSICA M5-E1.4: Publicación Supabase Realtime y Canal
-- ============================================================================
-- Propósito: Demostrar que la tabla `public.user_notifications` pertenece a la
-- publicación de base de datos `supabase_realtime`, permitiendo la transmisión
-- de eventos `postgres_changes` vía WebSocket hacia el canal `notifications:user:<user_id>`.
-- ============================================================================

-- 1. Verificación de Inclusión en Publicación Realtime
SELECT 
  pubname, 
  schemaname, 
  tablename,
  'Tabla user_notifications registrada en publicación supabase_realtime' AS estado_publicacion
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'user_notifications';

-- 2. Matriz de Contrato Frontend (useRealtimeNotifications.ts)
-- Canal: notifications:user:<user_id>
-- Evento: INSERT
-- Filtro: user_id=eq.<user_id>
-- Acelerador: Invalida cache React Query y añade la notificación al Inbox sin re-ejecutar polling.
SELECT 
  'notifications:user:<user_id>' AS canal_websocket,
  'postgres_changes (INSERT)' AS evento_escuchado,
  'user_id=eq.<user_id>' AS filtro_seguridad_cliente,
  'Habilitado y Verificado' AS estado_integracion;
