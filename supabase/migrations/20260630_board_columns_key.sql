-- =============================================================================
-- MIGRACIÓN: Añadir key a board_columns
-- Archivo: supabase/migrations/20260628_board_columns_key.sql
--
-- Problema: board_columns.id (UUID) actuaba a la vez como identidad interna
-- y como clave de lookup en items.values. Las columnas del motor ("status",
-- "priority", etc.) usaban strings literales en processColumns() porque no
-- tenían registros en BD; esos strings quedaron embebidos en items.values.
--
-- Solución: separar identidad (id UUID) de representación (key TEXT).
--   - Columnas del motor: key = 'status', 'priority', etc.
--   - Columnas de usuario: key = NULL → el frontend usa id como fallback.
--
-- El frontend pasa a usar: column.key ?? column.id  (un único punto de cambio).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- =============================================================================

ALTER TABLE board_columns
  ADD COLUMN IF NOT EXISTS key TEXT
    CONSTRAINT board_columns_key_not_empty
    CHECK (key IS NULL OR length(trim(key)) > 0);

-- Garantiza que no existan dos columnas con el mismo key en el mismo board.
-- La condición WHERE key IS NOT NULL excluye las columnas de usuario (NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_columns_board_key
  ON board_columns (board_id, key)
  WHERE key IS NOT NULL;

-- ─── Claves reservadas del motor (documentadas, no forzadas en BD) ───────────
-- status · priority · people · date · timeline · numbers · text
-- checkbox · tags · owner · progress
-- No crear columnas personalizadas con estos nombres para evitar colisiones.
