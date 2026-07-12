-- =============================================================================
-- Tests: contrato de concurrencia del Acta — NO es un test funcional.
--
-- Ref: docs/architecture/acta-billing-design.md, sección "Concurrencia".
--
-- Protege una DECISIÓN DE DISEÑO, no una columna ni un FK: toda función que
-- crea, lee el estado de, o modifica el borrador único de un board debe
-- tomar SELECT ... FROM boards WHERE id = <board_id> FOR UPDATE como primer
-- paso. Sin este test, alguien podría "optimizar" generate_acta_draft() o
-- issue_acta() quitando ese lock porque a simple vista parece innecesario
-- (ninguna de las dos funciones falla sin él en un entorno de un solo
-- usuario) — y reabriría en silencio la ventana de concurrencia cerrada en
-- 20260730_generate_acta_draft_lock_board.sql.
--
-- Se verifica inspeccionando el código fuente de la función
-- (pg_get_functiondef), no ejecutando concurrencia real — probar una
-- condición de carrera de verdad en pgTAP (una sola sesión, secuencial) no
-- es práctico. Esto es deliberadamente una prueba de contrato, no de
-- comportamiento en tiempo de ejecución.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/09_acta_concurrency_contract.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

BEGIN;

SELECT plan(2);

SELECT ok(
  pg_get_functiondef('public.generate_acta_draft(uuid)'::regprocedure)
    ~* 'FROM\s+public\.boards\s+WHERE\s+id\s*=\s*p_board_id\s+FOR\s+UPDATE',
  'Test 1: generate_acta_draft() toma el lock oficial de concurrencia (FOR UPDATE sobre boards) ✓'
);

SELECT ok(
  pg_get_functiondef('public.issue_acta(uuid)'::regprocedure)
    ~* 'FROM\s+public\.boards\s+WHERE\s+id\s*=\s*v_board_id\s+FOR\s+UPDATE',
  'Test 2: issue_acta() toma el lock oficial de concurrencia (FOR UPDATE sobre boards) ✓'
);

SELECT * FROM finish();
ROLLBACK;
