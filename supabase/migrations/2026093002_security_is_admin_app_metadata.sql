-- ============================================================================
-- Migración: 2026093002_security_is_admin_app_metadata.sql
-- SECURITY-AUDIT-01 / S1. Aplicada manualmente en producción el 2026-09-30 tras ensayo con rollback. is_admin() deja de confiar en user_metadata (editable por el usuario) y lee app_metadata desde auth.users; se fija search_path en 5 funciones SECURITY DEFINER.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT COALESCE(
    (SELECT u.raw_app_meta_data ->> 'role'
       FROM auth.users u
      WHERE u.id = auth.uid()) = 'admin',
    false);
$fn$;

ALTER FUNCTION public.get_user_board_role(uuid, uuid)                 SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_new_user()                               SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.fn_insert_activity_standard()                   SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.get_or_create_financial_item(uuid, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
