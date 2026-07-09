-- =============================================================================
-- Fix: la migración anterior (20260718_domain_command_idempotency.sql) usó
-- CREATE OR REPLACE FUNCTION report_execution(p_execution_id UUID, p_command_id
-- UUID DEFAULT NULL) — pero CREATE OR REPLACE solo reemplaza una función con
-- la MISMA firma de argumentos. Como la firma cambió (se agregó un parámetro),
-- Postgres creó un OVERLOAD nuevo en vez de reemplazar la función original de
-- 1 argumento, dejando dos versiones coexistiendo y "function report_execution
-- (uuid) is not unique" en cualquier llamada con un solo argumento.
--
-- Corrección: eliminar explícitamente la firma vieja de 1 argumento. La
-- firma nueva de 2 argumentos (con DEFAULT NULL) ya cubre ambos casos de uso
-- (con o sin command_id), así que no hace falta recrear el overload de 1 solo.
-- =============================================================================

DROP FUNCTION IF EXISTS public.report_execution(UUID);
