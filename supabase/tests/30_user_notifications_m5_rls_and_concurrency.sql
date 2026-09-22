-- =============================================================================
-- Suite 30: Módulo 5 (M5) — RLS, Permisos, Concurrencia y Publicación Realtime
--
-- CONTRATO: supabase/migrations/20260912_create_user_notifications.sql
-- Ref: Especificación Formal v5.0 (Fase 4 · Módulo 5)
--
-- Propósito:
--   1. Probar la atomicidad dominio -> notificación y persistencia del Read Model.
--   2. Probar el contrato de concurrencia e idempotencia ON CONFLICT (notification_dedup_key).
--   3. Probar la matriz de seguridad RLS bajo rol authenticated (auth.uid() aislado).
--   4. Probar controles negativos (INSERT, UPDATE, DELETE directos denegados).
--   5. Probar la transición autorizada UNREAD -> READ vía mark_notification_read RPC.
--   6. Probar la pertenencia de la tabla a la publicación supabase_realtime.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/30_user_notifications_m5_rls_and_concurrency.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures propios de este archivo (Prefijo notif01)
-- user_a = aaaaaaaa-0000-0000-0000-000000000001 (Supervisor autorizado)
-- user_b = aaaaaaaa-0000-0000-0000-000000000005 (Otro usuario aislado)
-- board  = notif01-0000-0000-0000-000000000001
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('notif01-0000-0000-0000-000000000001', 'Tablero M5 Notificaciones', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_board_roles (user_id, board_id, role, is_active)
VALUES 
  ('aaaaaaaa-0000-0000-0000-000000000001', 'notif01-0000-0000-0000-000000000001', 'SUPERVISOR', true),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'notif01-0000-0000-0000-000000000001', 'DIRECTOR', true)
ON CONFLICT (user_id, board_id, role) DO UPDATE SET is_active = true;

-- Sembrar notificaciones de prueba fixture para User A y User B
INSERT INTO public.user_notifications (
  id, event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message, is_read
) VALUES 
(
  'notif01-aaaa-0000-0000-000000000001'::uuid, 
  'evt-m5-fixture-a', 
  'aaaaaaaa-0000-0000-0000-000000000001__evt-m5-fixture-a', 
  'aaaaaaaa-0000-0000-0000-000000000001', 
  'notif01-0000-0000-0000-000000000001', 
  'ALERT-01', 
  'item-a', 
  'HIGH', 
  'Notificación User A', 
  'Mensaje A', 
  false
),
(
  'notif01-bbbb-0000-0000-000000000002'::uuid, 
  'evt-m5-fixture-b', 
  'aaaaaaaa-0000-0000-0000-000000000005__evt-m5-fixture-b', 
  'aaaaaaaa-0000-0000-0000-000000000005', 
  'notif01-0000-0000-0000-000000000001', 
  'ALERT-01', 
  'item-b', 
  'HIGH', 
  'Notificación User B', 
  'Mensaje B', 
  false
)
ON CONFLICT (notification_dedup_key) DO NOTHING;

BEGIN;

SELECT plan(10);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 1: Contrato de Concurrencia e Idempotencia en dispatch_user_notification
-- ─────────────────────────────────────────────────────────────────────────────
SELECT ok(
  pg_get_functiondef('public.dispatch_user_notification(text,uuid,text,text,text,text,text,text[])'::regprocedure)
    ~* 'ON\s+CONFLICT\s*\(\s*notification_dedup_key\s*\)\s*DO\s+NOTHING',
  'Test 1: dispatch_user_notification() implementa ON CONFLICT (notification_dedup_key) DO NOTHING ✓'
);

-- Test 2: Inclusión formal en la publicación Supabase Realtime
SELECT ok(
  (SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications'
  )),
  'Test 2: user_notifications está registrada en la publicación supabase_realtime ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 3-10: Ejecución bajo Rol Authenticated Real (User A)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

SET LOCAL ROLE authenticated;

-- Test 3: Verificación de identidad JWT auth.uid()
SELECT is(
  auth.uid(),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'Test 3: auth.uid() evalúa exactamente al usuario autenticado A ✓'
);

-- Test 4: SELECT propio permitido (User A ve su propia notificación)
SELECT is(
  (SELECT COUNT(*)::INT FROM public.user_notifications WHERE id = 'notif01-aaaa-0000-0000-000000000001'::uuid),
  1,
  'Test 4: User A ve su propia notificación vía RLS ✓'
);

-- Test 5: SELECT ajeno aislado (User A NO ve la notificación de User B)
SELECT is(
  (SELECT COUNT(*)::INT FROM public.user_notifications WHERE id = 'notif01-bbbb-0000-0000-000000000002'::uuid),
  0,
  'Test 5: User A no puede ver la notificación de User B vía RLS ✓'
);

-- Test 6 (Control Negativo): INSERT directo denegado por privilegios de tabla
SELECT throws_like(
  $$ INSERT INTO public.user_notifications (event_id, notification_dedup_key, user_id, board_id, alert_code, entity_id, severity, title, message)
     VALUES ('evt-neg-ins', 'neg-key', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'notif01-0000-0000-0000-000000000001'::uuid, 'ALERT-01', 'item-x', 'LOW', 'Title', 'Msg') $$,
  '%permission denied%',
  'Test 6: INSERT directo es rechazado por REVOKE (permission denied) ✓'
);

-- Test 7 (Control Negativo): UPDATE directo denegado por privilegios de tabla
SELECT throws_like(
  $$ UPDATE public.user_notifications SET is_read = true WHERE id = 'notif01-aaaa-0000-0000-000000000001'::uuid $$,
  '%permission denied%',
  'Test 7: UPDATE directo es rechazado por REVOKE (permission denied) ✓'
);

-- Test 8 (Control Negativo): DELETE directo denegado por privilegios de tabla
SELECT throws_like(
  $$ DELETE FROM public.user_notifications WHERE id = 'notif01-aaaa-0000-0000-000000000001'::uuid $$,
  '%permission denied%',
  'Test 8: DELETE directo es rechazado por REVOKE (permission denied) ✓'
);

-- Test 9: Transición autorizada UNREAD -> READ vía RPC mark_notification_read sobre notificación propia
DO $$
BEGIN
  PERFORM public.mark_notification_read('notif01-aaaa-0000-0000-0000-000000000001'::uuid);
END;
$$;

SELECT is(
  (SELECT is_read FROM public.user_notifications WHERE id = 'notif01-aaaa-0000-0000-000000000001'::uuid),
  true,
  'Test 9: mark_notification_read RPC actualizó is_read a true para User A ✓'
);

-- Test 10: Intento de User A de marcar como leída la notificación de User B vía RPC (Protección de estado ajeno)
DO $$
BEGIN
  PERFORM public.mark_notification_read('notif01-bbbb-0000-0000-000000000002'::uuid);
END;
$$;

RESET ROLE;

SELECT is(
  (SELECT is_read FROM public.user_notifications WHERE id = 'notif01-bbbb-0000-0000-000000000002'::uuid),
  false,
  'Test 10: RPC protegió el estado de User B (is_read permanece false) ✓'
);

SELECT * FROM finish();
ROLLBACK;
