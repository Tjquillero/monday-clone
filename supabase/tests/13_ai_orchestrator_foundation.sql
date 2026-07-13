-- =============================================================================
-- Tests: infraestructura del orquestador de IA (Fase 1, Hito 0)
--
-- CONTRATO: supabase/migrations/20260803_ai_orchestrator_foundation.sql
--
-- Cubre: get_current_board() (autorización + DTO correcto, nunca fila cruda),
-- log_ai_tool_call_attempt() (registra tanto intentos autorizados como no),
-- y que ai_tool_call_attempts es deny-by-default (sin política de
-- lectura/escritura directa desde el cliente).
--
-- Sin SAVEPOINT/ROLLBACK TO por test (ver nota en 01_state_machine.sql).
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/13_ai_orchestrator_foundation.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

BEGIN;

SELECT plan(9);

-- ─────────────────────────────────────────────────────────────────────────────
-- Fixtures (prefijo a10a1000). admin = ...-000000000001, no-miembro = ...-000000000005.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.boards (id, name, owner_id, created_at)
VALUES ('a10a1000-0000-0000-0000-000000000001', 'Test Board AI Orchestrator', 'aaaaaaaa-0000-0000-0000-000000000001', NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.board_members (board_id, user_id, role)
VALUES ('a10a1000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin')
ON CONFLICT (board_id, user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_current_board()
-- ─────────────────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT board_name FROM public.get_current_board('a10a1000-0000-0000-0000-000000000001')),
  'Test Board AI Orchestrator',
  'Test 1: get_current_board() devuelve el nombre correcto para un miembro ✓'
);

SELECT is(
  (SELECT role FROM public.get_current_board('a10a1000-0000-0000-0000-000000000001')),
  'admin',
  'Test 2: get_current_board() devuelve el rol correcto del usuario actual ✓'
);

SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
SELECT throws_like(
  $$ SELECT * FROM public.get_current_board('a10a1000-0000-0000-0000-000000000001') $$,
  '%No tiene acceso%',
  'Test 3: un usuario que no es miembro del board recibe una excepción, no una fila vacía en silencio ✓'
);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT throws_like(
  $$ SELECT * FROM public.get_current_board('00000000-0000-0000-0000-000000000000') $$,
  '%No tiene acceso%',
  'Test 4: un board_id inexistente también es rechazado (get_user_board_role devuelve NULL igual) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- log_ai_tool_call_attempt()
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_log_id UUID;
BEGIN
  v_log_id := public.log_ai_tool_call_attempt(
    'a10a1000-0000-0000-0000-000000000001', 'get_current_board', true,
    '{"p_board_id":"a10a1000-0000-0000-0000-000000000001"}'::jsonb, NULL
  );
  PERFORM set_config('ai_test.log_id_ok', v_log_id::TEXT, false);

  v_log_id := public.log_ai_tool_call_attempt(
    'a10a1000-0000-0000-0000-000000000001', 'delete_everything', false,
    '{}'::jsonb, 'Tool no está en la whitelist'
  );
  PERFORM set_config('ai_test.log_id_rejected', v_log_id::TEXT, false);
END;
$$;

SELECT is(
  (SELECT tool_name FROM public.ai_tool_call_attempts WHERE id = current_setting('ai_test.log_id_ok')::UUID),
  'get_current_board',
  'Test 5: un intento autorizado queda registrado con su tool_name correcto ✓'
);

SELECT is(
  (SELECT is_whitelisted FROM public.ai_tool_call_attempts WHERE id = current_setting('ai_test.log_id_rejected')::UUID),
  false,
  'Test 6: un intento fuera de la whitelist también queda registrado (is_whitelisted=false) — esto es lo valioso para saber qué tools faltan ✓'
);

SELECT is(
  (SELECT user_id FROM public.ai_tool_call_attempts WHERE id = current_setting('ai_test.log_id_ok')::UUID),
  'aaaaaaaa-0000-0000-0000-000000000001'::UUID,
  'Test 7: el log usa auth.uid() real, no un user_id pasado por parámetro (no falsificable desde el cliente) ✓'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Test 8-9: ai_tool_call_attempts es deny-by-default — sin pasar por la
-- función, ni lectura ni escritura directa bajo RLS real.
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT COUNT(*)::INT FROM public.ai_tool_call_attempts),
  0,
  'Test 8: un usuario authenticated no puede LEER ai_tool_call_attempts directamente (deny-by-default) ✓'
);

SELECT throws_like(
  $$ INSERT INTO public.ai_tool_call_attempts (user_id, tool_name, is_whitelisted)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'x', true) $$,
  '%row-level security%',
  'Test 9: un INSERT directo (sin pasar por log_ai_tool_call_attempt) es rechazado por RLS ✓'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
