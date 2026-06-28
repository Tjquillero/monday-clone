-- =============================================================================
-- MIGRACIÓN: Extender board_columns con metadatos de configuración
-- Archivo: supabase/migrations/20260628_board_columns_schema.sql
--
-- Problema: board_columns no almacenaba la configuración de cada columna
-- (opciones de status, etiquetas, formato numérico, etc.). La fuente de
-- verdad vivía en processColumns() del frontend.
--
-- Esta migración solo modifica el esquema. El backfill de datos existentes
-- y la eliminación de processColumns() van en pasos separados.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS garantiza re-ejecución segura.
-- =============================================================================

ALTER TABLE board_columns
  ADD COLUMN IF NOT EXISTS options  JSONB   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS editable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hidden   BOOLEAN NOT NULL DEFAULT FALSE;
