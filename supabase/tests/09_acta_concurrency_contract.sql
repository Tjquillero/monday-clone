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
-- adjust_acta_item_quantity() (Commit 4) usa un recurso de sincronización
-- DISTINTO, a propósito: no el lock de boards (eso sincroniza creación de
-- borrador + numeración, no aplica a editar una línea), sino dos locks de
-- fila propios — actas (mismo recurso que issue_acta(), sincroniza el
-- ajuste con una emisión concurrente de la misma acta) y acta_items
-- (sincroniza dos administradores editando la misma línea al mismo
-- tiempo, evitando una actualización perdida). Se protegen aquí también,
-- por la misma razón: sin ellos, "ninguna función falla en un entorno de
-- un solo usuario" seguiría siendo cierto, y esa es justamente la señal de
-- que el lock es fácil de "optimizar" por error.
--
-- Se verifica inspeccionando el código fuente de la función
-- (pg_get_functiondef), no ejecutando concurrencia real — probar una
-- condición de carrera de verdad en pgTAP (una sola sesión, secuencial) no
-- es práctico. Esto es deliberadamente una prueba de contrato, no de
-- comportamiento en tiempo de ejecución.
--
-- ESTE TEST ESTÁ INTENCIONADAMENTE ACOPLADO A LA IMPLEMENTACIÓN (nombres de
-- variable locales incluidos, p_board_id / v_board_id). Su objetivo es
-- detectar cualquier modificación del mecanismo oficial de sincronización
-- — incluso si eso implica actualizar el test tras una refactorización
-- legítima (ej. un rename de variable). No es un descuido: la propiedad
-- protegida no es "existe algún lock", sino "esta función sincroniza sobre
-- el recurso correcto" — y eso solo se puede verificar leyendo el código
-- real, no infiriéndolo de un patrón genérico.
--
-- Ejecutar:
--   supabase test db --linked supabase/tests/09_acta_concurrency_contract.sql
-- =============================================================================

SET search_path = public, extensions, pg_catalog;
SET ROLE postgres;

BEGIN;

SELECT plan(4);

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

SELECT ok(
  pg_get_functiondef('public.adjust_acta_item_quantity(uuid,numeric)'::regprocedure)
    ~* 'FROM\s+public\.actas\s+WHERE\s+id\s*=\s*v_acta_id\s+FOR\s+UPDATE',
  'Test 3: adjust_acta_item_quantity() toma el lock sobre actas (mismo recurso que issue_acta()) ✓'
);

SELECT ok(
  pg_get_functiondef('public.adjust_acta_item_quantity(uuid,numeric)'::regprocedure)
    ~* 'FROM\s+public\.acta_items\s+WHERE\s+id\s*=\s*p_acta_item_id\s+FOR\s+UPDATE',
  'Test 4: adjust_acta_item_quantity() toma el lock sobre acta_items (sincroniza ediciones concurrentes de la misma línea) ✓'
);

SELECT * FROM finish();
ROLLBACK;
