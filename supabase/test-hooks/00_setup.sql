-- =============================================================================
-- Test fixture setup — ejecutar ANTES de los tests:
--   supabase db query --linked < supabase/tests/00_setup.sql
--
-- Crea 5 usuarios de prueba con UUIDs fijos en auth.users y el board de prueba.
-- Los tests asumen que estos registros ya existen.
-- Para limpiar: supabase db query --linked < supabase/tests/99_teardown.sql
-- =============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'admin_test@mantenix.test',    '', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'assistant_test@mantenix.test', '', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'leader_test@mantenix.test',   '', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'supervisor_test@mantenix.test','', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000005',
   'authenticated', 'authenticated', 'viewer_test@mantenix.test',   '', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
