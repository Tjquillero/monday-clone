-- =============================================================================
-- MANTENIX
-- F5.3 — Reparación de persistencia de idempotencia
-- Fecha: 2026-09-12
-- =============================================================================
-- Propósito:
-- Formalizar en PostgreSQL el atributo que F5.3 ya consume contractualmente
-- en el código TypeScript.
--
-- Esta migración NO pertenece a POD-01.
-- No crea una nueva fuente de verdad.
-- No crea tablas.
-- No modifica datos históricos.
-- No modifica la semántica de ExecutionRecord.
-- =============================================================================

ALTER TABLE public.weekly_plan_item_executions
ADD COLUMN IF NOT EXISTS source_mutation_id TEXT NULL;

COMMENT ON COLUMN public.weekly_plan_item_executions.source_mutation_id IS
'Identificador de mutación idempotente para reintentos y sincronización offline (F5.3). NULL en registros históricos previos a esta migración.';

