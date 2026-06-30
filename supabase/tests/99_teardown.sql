-- =============================================================================
-- Test fixture teardown — ejecutar DESPUÉS de los tests:
--   supabase db query --linked < supabase/tests/99_teardown.sql
-- =============================================================================

DELETE FROM auth.users
WHERE id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004',
  'aaaaaaaa-0000-0000-0000-000000000005'
);
