-- =============================================================================
-- BACKFILL: Columnas del motor con key y options exactas del frontend
-- Archivo: supabase/migrations/20260629_board_columns_seed.sql
--
-- PREREQUISITOS:
--   20260628_board_columns_schema.sql  (options, required, editable, hidden)
--   20260630_board_columns_key.sql     (key, unique index)
--
-- Qué hace:
--   1. Actualiza options en columnas existentes que aún tienen options = '{}'.
--   2. Inserta las cuatro columnas del motor (status, priority, people, date)
--      en cada board que no las tenga, con su key estable.
--
-- IDs de labels: coinciden EXACTAMENTE con los valores en items.values hoy:
--   status  → "Not Started" (132 ítems), "Working on it" (4 ítems)
--   priority → sin datos — IDs en inglés según flujo del frontend
--   Cualquier cambio en estos IDs requeriría migrar todos los items.values.
--
-- Qué NO hace: no añade columnas de dominio (unit_price, cant, rubro, etc.).
--   Esas pertenecen a templates de board, no al motor genérico.
--
-- IDEMPOTENTE: inserciones con NOT EXISTS; updates con WHERE options = '{}'.
-- =============================================================================

DO $$
DECLARE
  -- IDs extraídos de getNextStatus() y getStatusColor() en BoardView.tsx
  STATUS_OPTIONS CONSTANT JSONB := '{
    "labels": [
      {"id": "Not Started",   "title": "Pendiente",  "color": "#334155"},
      {"id": "Working on it", "title": "En proceso",  "color": "#F59E0B"},
      {"id": "Done",          "title": "Completado",  "color": "#10B981"},
      {"id": "Stuck",         "title": "Bloqueado",   "color": "#EF4444"}
    ],
    "default": "Not Started"
  }';

  -- IDs extraídos de getNextPriority() y getPriorityColor() en BoardView.tsx
  PRIORITY_OPTIONS CONSTANT JSONB := '{
    "labels": [
      {"id": "Low",    "title": "Baja",  "color": "#3B7EF8"},
      {"id": "Medium", "title": "Media", "color": "#F59E0B"},
      {"id": "High",   "title": "Alta",  "color": "#EF4444"}
    ],
    "default": "Low"
  }';

  PEOPLE_OPTIONS CONSTANT JSONB := '{"multiple": true}';
  DATE_OPTIONS   CONSTANT JSONB := '{"includeTime": false}';

  v_board_id UUID;
  v_max_pos  INTEGER;
BEGIN

  -- ── 1. Rellenar options en columnas que ya existen sin configuración ────────
  UPDATE board_columns SET options = STATUS_OPTIONS,   key = 'status'
    WHERE type = 'status'             AND options = '{}';

  UPDATE board_columns SET options = PRIORITY_OPTIONS, key = 'priority'
    WHERE type = 'priority'           AND options = '{}';

  UPDATE board_columns SET options = PEOPLE_OPTIONS,   key = 'people'
    WHERE type = 'people'             AND options = '{}';

  UPDATE board_columns SET options = DATE_OPTIONS,     key = 'date'
    WHERE type IN ('date', 'timeline') AND options = '{}';

  -- ── 2. Insertar columnas del motor en boards que no las tengan ──────────────
  FOR v_board_id IN SELECT id FROM boards LOOP

    SELECT COALESCE(MAX(position), -1) INTO v_max_pos
      FROM board_columns WHERE board_id = v_board_id;

    IF NOT EXISTS (
      SELECT 1 FROM board_columns WHERE board_id = v_board_id AND type = 'status'
    ) THEN
      v_max_pos := v_max_pos + 1;
      INSERT INTO board_columns (board_id, title, type, key, width, position, options, required)
      VALUES (v_board_id, 'Estado', 'status', 'status', 140, v_max_pos, STATUS_OPTIONS, TRUE);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM board_columns WHERE board_id = v_board_id AND type = 'priority'
    ) THEN
      v_max_pos := v_max_pos + 1;
      INSERT INTO board_columns (board_id, title, type, key, width, position, options)
      VALUES (v_board_id, 'Prioridad', 'priority', 'priority', 120, v_max_pos, PRIORITY_OPTIONS);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM board_columns WHERE board_id = v_board_id AND type = 'people'
    ) THEN
      v_max_pos := v_max_pos + 1;
      INSERT INTO board_columns (board_id, title, type, key, width, position, options)
      VALUES (v_board_id, 'Responsable', 'people', 'people', 150, v_max_pos, PEOPLE_OPTIONS);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM board_columns WHERE board_id = v_board_id AND type IN ('date', 'timeline')
    ) THEN
      v_max_pos := v_max_pos + 1;
      INSERT INTO board_columns (board_id, title, type, key, width, position, options)
      VALUES (v_board_id, 'Fecha', 'date', 'date', 130, v_max_pos, DATE_OPTIONS);
    END IF;

  END LOOP;

END $$;
