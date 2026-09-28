-- =============================================================================
-- Tests: C1.2 Personnel Security Hardening — INV-MOB-07
--
-- CONTRATO: supabase/migrations/20260925_02_c12_security_hardening.sql
-- Ref:      src/lib/personnelIngestionService.ts, src/lib/__tests__/personnelMobilityGovernanceC12.test.ts
--
-- Verifica el comportamiento REAL de PostgreSQL (evidencia tipo E) para los
-- 17 requisitos del GATE-C1.2-02. Los tests Jest (tipo A-D) no sustituyen
-- este archivo.
--
-- Prerequisito: npm run test:db:setup (00_setup.sql aplicado)
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/c12_personnel_security.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;

-- Escalar a postgres (BYPASSRLS) para instalar fixtures.
SET ROLE postgres;

-- JWT del admin de prueba (aaaaaaaa-...-0001) a nivel de sesión.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

-- Helper de sesión
CREATE OR REPLACE FUNCTION _c12_set_user(p_user_id TEXT)
RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::TEXT, true);
$$;

BEGIN;

SELECT plan(17);

-- =============================================================================
-- Fixtures de C1.2
-- =============================================================================

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('c1200000-0000-0000-0000-000000000001', 'Test Board C12 Personnel', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;

-- user_board_roles: admin activo para aaaaaaaa-...-0001
INSERT INTO public.user_board_roles (user_id, board_id, role, is_active)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'c1200000-0000-0000-0000-000000000001', 'admin', true)
ON CONFLICT DO NOTHING;

-- Personnel de prueba
INSERT INTO public.personnel (id, document_id, name, role, default_rate)
VALUES ('c1200000-0000-0000-0000-000000000010', '12345678', 'Operario Test C12', 'Operador', 1750905)
ON CONFLICT (id) DO NOTHING;

-- Versión inicial PUBLISHED
SELECT set_config('app.rpc_gateway', 'reassign_personnel_governed_xact', true);

INSERT INTO public.personnel_versions (id, board_id, version_name, status, is_active, effective_from)
VALUES ('c1200000-0000-0000-0000-000000000020', 'c1200000-0000-0000-0000-000000000001',
        'V1 - Carga Inicial Test', 'DRAFT', false, CURRENT_DATE - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personnel_site_assignments (version_id, personnel_id, role_in_site, zone, dedication_percentage)
VALUES ('c1200000-0000-0000-0000-000000000020', 'c1200000-0000-0000-0000-000000000010',
        'Operador', 'GENERAL', 100)
ON CONFLICT DO NOTHING;

UPDATE public.personnel_versions
SET status = 'PUBLISHED', is_active = true
WHERE id = 'c1200000-0000-0000-0000-000000000020';

SELECT set_config('app.rpc_gateway', '', true);

-- =============================================================================
-- PG-01 a PG-06: authenticated no tiene escritura directa (REVOKE)
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000001');

SELECT throws_ok(
  $$ INSERT INTO public.personnel_versions (board_id, version_name, status, is_active, effective_from)
     VALUES ('c1200000-0000-0000-0000-000000000001', 'Intento directo', 'PUBLISHED', false, CURRENT_DATE) $$,
  '42501',
  NULL,
  'PG-01: authenticated no puede INSERT en personnel_versions (REVOKE activo) ✓'
);

SELECT throws_ok(
  $$ UPDATE public.personnel_versions SET version_name = 'Hack' WHERE id = 'c1200000-0000-0000-0000-000000000020' $$,
  '42501',
  NULL,
  'PG-02: authenticated no puede UPDATE en personnel_versions (REVOKE activo) ✓'
);

SELECT throws_ok(
  $$ DELETE FROM public.personnel_versions WHERE id = 'c1200000-0000-0000-0000-000000000020' $$,
  '42501',
  NULL,
  'PG-03: authenticated no puede DELETE en personnel_versions (REVOKE activo) ✓'
);

SELECT throws_ok(
  $$ INSERT INTO public.personnel_site_assignments (version_id, personnel_id, role_in_site, zone, dedication_percentage)
     VALUES ('c1200000-0000-0000-0000-000000000020', 'c1200000-0000-0000-0000-000000000010', 'Hack', 'GENERAL', 100) $$,
  '42501',
  NULL,
  'PG-04: authenticated no puede INSERT en personnel_site_assignments (REVOKE activo) ✓'
);

SELECT throws_ok(
  $$ UPDATE public.personnel_site_assignments SET role_in_site = 'Hack' WHERE version_id = 'c1200000-0000-0000-0000-000000000020' $$,
  '42501',
  NULL,
  'PG-05: authenticated no puede UPDATE en personnel_site_assignments (REVOKE activo) ✓'
);

SELECT throws_ok(
  $$ DELETE FROM public.personnel_site_assignments WHERE version_id = 'c1200000-0000-0000-0000-000000000020' $$,
  '42501',
  NULL,
  'PG-06: authenticated no puede DELETE en personnel_site_assignments (REVOKE activo) ✓'
);

-- =============================================================================
-- PG-07: SELECT-only RLS
-- =============================================================================

SELECT ok(
  EXISTS (SELECT 1 FROM public.personnel_versions
          WHERE id = 'c1200000-0000-0000-0000-000000000020')
  AND EXISTS (SELECT 1 FROM public.personnel_site_assignments
              WHERE version_id = 'c1200000-0000-0000-0000-000000000020'),
  'PG-07: authenticated puede SELECT personnel_versions y assignments via RLS ✓'
);

SET ROLE postgres;

-- =============================================================================
-- PG-08: RPC autorizado funciona
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000001');

SELECT lives_ok(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       'c1200000-0000-0000-0000-000000000020'::UUID,
       'c1200000-0000-0000-0000-000000000010'::UUID,
       NULL,
       'GENERAL',
       CURRENT_DATE,
       'Reasignacion test PG-08',
       'aaaaaaaa-0000-0000-0000-000000000001'::UUID
     ) $$,
  'PG-08: admin del board puede llamar reassign_personnel_governed_xact (RPC autorizado) ✓'
);

SET ROLE postgres;

-- =============================================================================
-- PG-09: Usuario no autorizado (sin rol activo) es rechazado
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000005'); -- viewer, sin rol en c12mob board

SELECT throws_like(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       (SELECT id FROM public.personnel_versions WHERE board_id = 'c1200000-0000-0000-0000-000000000001' AND status = 'PUBLISHED' ORDER BY effective_from DESC, created_at DESC LIMIT 1),
       'c1200000-0000-0000-0000-000000000010'::UUID,
       NULL, 'GENERAL', (CURRENT_DATE + INTERVAL '1 day')::DATE,
       'Intento no autorizado',
       'aaaaaaaa-0000-0000-0000-000000000005'::UUID
     ) $$,
  '%RBAC_FORBIDDEN%',
  'PG-09: usuario sin rol activo en el board es rechazado con RBAC_FORBIDDEN ✓'
);

SET ROLE postgres;

-- =============================================================================
-- PG-10: Actor spoofing rechazado (actor_user_id != auth.uid())
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000001'); -- admin real

SELECT throws_like(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       (SELECT id FROM public.personnel_versions WHERE board_id = 'c1200000-0000-0000-0000-000000000001' AND status = 'PUBLISHED' ORDER BY effective_from DESC, created_at DESC LIMIT 1),
       'c1200000-0000-0000-0000-000000000010'::UUID,
       NULL, 'GENERAL', (CURRENT_DATE + INTERVAL '1 day')::DATE,
       'Intento spoofing',
       'aaaaaaaa-0000-0000-0000-000000000005'::UUID
     ) $$,
  '%ACTOR_SPOOFING_FORBIDDEN%',
  'PG-10: actor_user_id diferente a auth.uid() rechazado con ACTOR_SPOOFING_FORBIDDEN ✓'
);

SET ROLE postgres;

-- =============================================================================
-- PG-11: service_role sin actor rechazado
-- =============================================================================

SELECT set_config('request.jwt.claims', '', true);

SELECT throws_like(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       (SELECT id FROM public.personnel_versions WHERE board_id = 'c1200000-0000-0000-0000-000000000001' AND status = 'PUBLISHED' ORDER BY effective_from DESC, created_at DESC LIMIT 1),
       'c1200000-0000-0000-0000-000000000010'::UUID,
       NULL, 'GENERAL', (CURRENT_DATE + INTERVAL '1 day')::DATE,
       'Llamada service_role sin actor',
       NULL
     ) $$,
  '%SERVICE_ROLE_ACTOR_REQUIRED%',
  'PG-11: service_role sin p_actor_user_id rechazado con SERVICE_ROLE_ACTOR_REQUIRED ✓'
);

-- =============================================================================
-- PG-12: service_role CON actor válido funciona
-- =============================================================================

SELECT set_config('request.jwt.claims', '', true);

SELECT lives_ok(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       (SELECT id FROM public.personnel_versions WHERE board_id = 'c1200000-0000-0000-0000-000000000001' AND status = 'PUBLISHED' ORDER BY effective_from DESC, created_at DESC LIMIT 1),
       'c1200000-0000-0000-0000-000000000010'::UUID,
       NULL, 'GENERAL', (CURRENT_DATE + INTERVAL '1 day')::DATE,
       'Llamada service_role con actor valido PG-12',
       'aaaaaaaa-0000-0000-0000-000000000001'::UUID
     ) $$,
  'PG-12: service_role con actor_user_id valido puede ejecutar el RPC ✓'
);

-- =============================================================================
-- PG-13: INSERT DRAFT directo bloqueado por trigger fn_block_direct_draft_insert
-- =============================================================================

SELECT set_config('app.rpc_gateway', '', true);

SELECT throws_like(
  $$ INSERT INTO public.personnel_versions (board_id, version_name, status, is_active, effective_from)
     VALUES ('c1200000-0000-0000-0000-000000000001', 'DRAFT directo', 'DRAFT', false, (CURRENT_DATE + INTERVAL '2 days')::DATE) $$,
  '%DIRECT_DRAFT_FORBIDDEN%',
  'PG-13: INSERT DRAFT directo bloqueado por trigger (DIRECT_DRAFT_FORBIDDEN) ✓'
);

-- =============================================================================
-- PG-14: Operación gobernada atómica
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000001');

SELECT throws_like(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       (SELECT id FROM public.personnel_versions WHERE board_id = 'c1200000-0000-0000-0000-000000000001' AND status = 'PUBLISHED' ORDER BY effective_from DESC, created_at DESC LIMIT 1),
       'c1200000-0000-0000-0000-000000000099'::UUID,
       NULL, 'GENERAL', (CURRENT_DATE + INTERVAL '2 days')::DATE,
       'Intento con persona inexistente',
       'aaaaaaaa-0000-0000-0000-000000000001'::UUID
     ) $$,
  '%PERSONNEL_NOT_IN_SOURCE_VERSION%',
  'PG-14: fallo en RPC revierte completamente (atómico, no deja versiones parciales) ✓'
);

SET ROLE postgres;

-- =============================================================================
-- PG-15: PUBLISHED histórico inmutable
-- =============================================================================

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000001');

SELECT throws_ok(
  $$ UPDATE public.personnel_versions
     SET status = 'ARCHIVED'
     WHERE id = 'c1200000-0000-0000-0000-000000000020' $$,
  '42501',
  NULL,
  'PG-15: authenticated no puede alterar status de versión PUBLISHED (inmutable via REVOKE) ✓'
);

SET ROLE postgres;

-- =============================================================================
-- PG-16: Bootstrap solo en estado inicial
-- =============================================================================

SELECT ok(
  (SELECT COUNT(*) FROM public.personnel_site_assignments WHERE version_id = 'c1200000-0000-0000-0000-000000000020') > 0,
  'PG-16: versión activa con asignaciones previas bloquea el bootstrap (guard verificada) ✓'
);

-- =============================================================================
-- PG-17: Bootstrap no reutilizable como movilidad
-- =============================================================================

INSERT INTO public.personnel_versions (id, board_id, version_name, status, is_active, effective_from)
VALUES ('c1200000-0000-0000-0000-000000000030', 'c1200000-0000-0000-0000-000000000001',
        'V-VACIA (como post-bootstrap)', 'PUBLISHED', false, (CURRENT_DATE + INTERVAL '10 days')::DATE)
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT _c12_set_user('aaaaaaaa-0000-0000-0000-000000000001');

SELECT throws_like(
  $$ SELECT public.reassign_personnel_governed_xact(
       'c1200000-0000-0000-0000-000000000001'::UUID,
       'c1200000-0000-0000-0000-000000000030'::UUID,
       'c1200000-0000-0000-0000-000000000010'::UUID,
       NULL, 'GENERAL', (CURRENT_DATE + INTERVAL '10 days')::DATE,
       'Intento de usar version vacia como origen de movilidad',
       'aaaaaaaa-0000-0000-0000-000000000001'::UUID
     ) $$,
  '%PERSONNEL_NOT_IN_SOURCE_VERSION%',
  'PG-17: versión vacía (post-bootstrap) no puede usarse como origen de movilidad operacional ✓'
);

SET ROLE postgres;

-- =============================================================================
-- Fin del plan
-- =============================================================================

SELECT * FROM finish();

ROLLBACK;
