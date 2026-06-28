-- =============================================================================
-- Fase 2: Board Templates — Normalized Schema
-- =============================================================================
--
-- board_templates already exists in the remote DB (created via Dashboard)
-- with columns: id, name, description, structure (JSONB), created_by, created_at.
-- We extend it with icon/color and add two normalized child tables.
--
-- Replaces the monolithic structure JSONB with proper relational tables so
-- templates can carry full column metadata (key, options, required, width) and
-- group definitions — making injectDomainColumns() in useBoardData.ts obsolete.
-- =============================================================================

-- ─── Extend board_templates ───────────────────────────────────────────────────

-- Ensure the table exists (idempotent — creates only if missing)
CREATE TABLE IF NOT EXISTS board_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  structure   JSONB,          -- legacy field — kept for backward compat, ignored by new code
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The existing remote table has structure JSONB NOT NULL (created via Dashboard).
-- Make it nullable so new system templates don't need a legacy JSONB blob.
ALTER TABLE board_templates ALTER COLUMN structure DROP NOT NULL;

ALTER TABLE board_templates
  ADD COLUMN IF NOT EXISTS icon        TEXT NOT NULL DEFAULT 'layout',
  ADD COLUMN IF NOT EXISTS color       TEXT NOT NULL DEFAULT '#3B7EF8',
  ADD COLUMN IF NOT EXISTS is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─── board_template_columns ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS board_template_columns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES board_templates(id) ON DELETE CASCADE,
  key         TEXT,                         -- semantic key for system columns; NULL for domain columns
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,
  position    INT  NOT NULL DEFAULT 0,
  width       INT  NOT NULL DEFAULT 150,
  options     JSONB NOT NULL DEFAULT '{}',
  required    BOOLEAN NOT NULL DEFAULT FALSE,
  hidden      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_btc_template_id ON board_template_columns(template_id, position);

-- ─── board_template_groups ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS board_template_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES board_templates(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#c4c4c4',
  position    INT  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_btg_template_id ON board_template_groups(template_id, position);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Templates are system config — any authenticated user can read them.
-- Writes are restricted to service role (migrations only).

ALTER TABLE board_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_template_columns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_template_groups    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read templates"  ON board_templates;
CREATE POLICY "Authenticated users read templates" ON board_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users read template columns" ON board_template_columns;
CREATE POLICY "Authenticated users read template columns" ON board_template_columns
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users read template groups" ON board_template_groups;
CREATE POLICY "Authenticated users read template groups" ON board_template_groups
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── Seed: system templates ───────────────────────────────────────────────────
-- Deterministic UUIDs so the seed is idempotent (ON CONFLICT DO NOTHING).
-- Template IDs use the 00000000-0000-0000-0000-0000000000XX pattern.

DO $$
DECLARE
  t_vacio      UUID := '00000000-0000-0000-0000-000000000001';
  t_preventivo UUID := '00000000-0000-0000-0000-000000000002';
  t_correctivo UUID := '00000000-0000-0000-0000-000000000003';
  t_documental UUID := '00000000-0000-0000-0000-000000000004';
  t_incidentes UUID := '00000000-0000-0000-0000-000000000005';
BEGIN

  -- ── Templates ──────────────────────────────────────────────────────────────

  INSERT INTO board_templates (id, name, description, icon, color, is_system) VALUES
    (t_vacio,      'Vacío',                    'Tablero en blanco con columnas base',                   'layout',   '#6B7280', true),
    (t_preventivo, 'Mantenix Preventivo',       'Gestión de mantenimiento preventivo programado',        'tool',     '#3B7EF8', true),
    (t_correctivo, 'Mantenix Correctivo',       'Seguimiento de averías y mantenimiento reactivo',       'wrench',   '#F59E0B', true),
    (t_documental, 'Gestión Documental',        'Control de versiones y aprobaciones de documentos',    'file-text','#10B981', true),
    (t_incidentes, 'Registro de Incidentes',    'Gestión de incidentes HSE y novedades de campo',       'alert-triangle','#EF4444', true)
  ON CONFLICT (id) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    icon        = EXCLUDED.icon,
    color       = EXCLUDED.color,
    is_system   = EXCLUDED.is_system,
    updated_at  = NOW();

  -- Clear and re-seed columns (idempotent delete + insert)
  DELETE FROM board_template_columns WHERE template_id IN (t_vacio, t_preventivo, t_correctivo, t_documental, t_incidentes);
  DELETE FROM board_template_groups  WHERE template_id IN (t_vacio, t_preventivo, t_correctivo, t_documental, t_incidentes);

  -- ── Template: Vacío ─────────────────────────────────────────────────────────

  INSERT INTO board_template_columns (template_id, key, title, type, position, width, options, required) VALUES
    (t_vacio, 'status',   'Estado',      'status',   0,  140, '{"labels":[{"id":"Not Started","title":"Pendiente","color":"#334155"},{"id":"Working on it","title":"En proceso","color":"#F59E0B"},{"id":"Done","title":"Completado","color":"#10B981"},{"id":"Stuck","title":"Bloqueado","color":"#EF4444"}],"default":"Not Started"}', true),
    (t_vacio, 'priority', 'Prioridad',   'priority', 10, 120, '{"labels":[{"id":"Low","title":"Baja","color":"#3B7EF8"},{"id":"Medium","title":"Media","color":"#F59E0B"},{"id":"High","title":"Alta","color":"#EF4444"}],"default":"Low"}', false),
    (t_vacio, 'people',   'Responsable', 'people',   20, 160, '{"multiple":false}', false),
    (t_vacio, 'date',     'Fecha',       'date',     30, 130, '{"includeTime":false}', false);

  INSERT INTO board_template_groups (template_id, title, color, position) VALUES
    (t_vacio, 'Grupo 1', '#3B7EF8', 0);

  -- ── Template: Mantenix Preventivo ───────────────────────────────────────────

  INSERT INTO board_template_columns (template_id, key, title, type, position, width, options, required) VALUES
    (t_preventivo, 'status',   'Estado',          'status',   0,  140, '{"labels":[{"id":"Not Started","title":"Pendiente","color":"#334155"},{"id":"Working on it","title":"En proceso","color":"#F59E0B"},{"id":"Done","title":"Completado","color":"#10B981"},{"id":"Stuck","title":"Bloqueado","color":"#EF4444"}],"default":"Not Started"}', true),
    (t_preventivo, 'priority', 'Prioridad',        'priority', 10, 120, '{"labels":[{"id":"Low","title":"Baja","color":"#3B7EF8"},{"id":"Medium","title":"Media","color":"#F59E0B"},{"id":"High","title":"Alta","color":"#EF4444"}],"default":"Low"}', false),
    (t_preventivo, 'people',   'Responsable',      'people',   20, 160, '{"multiple":true}', false),
    (t_preventivo, 'date',     'Fecha',            'date',     30, 130, '{"includeTime":false}', false),
    (t_preventivo, NULL,       'Precio Unitario',  'numbers',  40, 140, '{"format":"currency","decimals":2,"prefix":"$"}', false),
    (t_preventivo, NULL,       'Cantidad',         'numbers',  50, 110, '{"format":"number","decimals":2}', false),
    (t_preventivo, NULL,       'Categoría',        'text',     60, 150, '{}', false),
    (t_preventivo, NULL,       'Rubro Mayor',      'text',     70, 150, '{}', false);

  INSERT INTO board_template_groups (template_id, title, color, position) VALUES
    (t_preventivo, 'Actividades',  '#3B7EF8', 0),
    (t_preventivo, 'Presupuesto',  '#10B981', 10);

  -- ── Template: Mantenix Correctivo ───────────────────────────────────────────

  INSERT INTO board_template_columns (template_id, key, title, type, position, width, options, required) VALUES
    (t_correctivo, 'status',   'Estado',           'status',   0,  140, '{"labels":[{"id":"Reported","title":"Reportado","color":"#EF4444"},{"id":"In Progress","title":"En Progreso","color":"#F59E0B"},{"id":"Resolved","title":"Resuelto","color":"#10B981"},{"id":"Closed","title":"Cerrado","color":"#334155"}],"default":"Reported"}', true),
    (t_correctivo, 'priority', 'Prioridad',         'priority', 10, 120, '{"labels":[{"id":"Low","title":"Baja","color":"#3B7EF8"},{"id":"Medium","title":"Media","color":"#F59E0B"},{"id":"High","title":"Alta","color":"#EF4444"},{"id":"Critical","title":"Crítico","color":"#7C3AED"}],"default":"Medium"}', false),
    (t_correctivo, 'people',   'Responsable',       'people',   20, 160, '{"multiple":false}', false),
    (t_correctivo, 'date',     'Fecha Reporte',     'date',     30, 130, '{"includeTime":true}', true),
    (t_correctivo, NULL,       'Fecha Cierre',      'date',     40, 130, '{"includeTime":false}', false),
    (t_correctivo, NULL,       'Equipo Afectado',   'text',     50, 180, '{}', false),
    (t_correctivo, NULL,       'Causa Raíz',        'text',     60, 200, '{}', false);

  INSERT INTO board_template_groups (template_id, title, color, position) VALUES
    (t_correctivo, 'Reportados',       '#EF4444', 0),
    (t_correctivo, 'En Proceso',       '#F59E0B', 10),
    (t_correctivo, 'Resueltos',        '#10B981', 20);

  -- ── Template: Gestión Documental ────────────────────────────────────────────

  INSERT INTO board_template_columns (template_id, key, title, type, position, width, options, required) VALUES
    (t_documental, 'status',   'Estado',      'status',   0,  140, '{"labels":[{"id":"Draft","title":"Borrador","color":"#6B7280"},{"id":"Review","title":"En Revisión","color":"#F59E0B"},{"id":"Approved","title":"Aprobado","color":"#10B981"},{"id":"Archived","title":"Archivado","color":"#334155"}],"default":"Draft"}', true),
    (t_documental, 'people',   'Responsable', 'people',   10, 160, '{"multiple":false}', true),
    (t_documental, 'date',     'Fecha',       'date',     20, 130, '{"includeTime":false}', false),
    (t_documental, NULL,       'Versión',     'text',     30, 100, '{}', false),
    (t_documental, NULL,       'Aprobador',   'people',   40, 160, '{"multiple":false}', false),
    (t_documental, NULL,       'Tipo',        'dropdown', 50, 150, '{"labels":[{"id":"Procedimiento","title":"Procedimiento","color":"#3B7EF8"},{"id":"Instructivo","title":"Instructivo","color":"#10B981"},{"id":"Formato","title":"Formato","color":"#F59E0B"},{"id":"Política","title":"Política","color":"#7C3AED"}],"default":"Procedimiento"}', false);

  INSERT INTO board_template_groups (template_id, title, color, position) VALUES
    (t_documental, 'En Revisión',  '#F59E0B', 0),
    (t_documental, 'Aprobados',    '#10B981', 10),
    (t_documental, 'Archivados',   '#6B7280', 20);

  -- ── Template: Registro de Incidentes ────────────────────────────────────────

  INSERT INTO board_template_columns (template_id, key, title, type, position, width, options, required) VALUES
    (t_incidentes, 'status',   'Estado',      'status',   0,  140, '{"labels":[{"id":"Open","title":"Abierto","color":"#EF4444"},{"id":"Investigating","title":"En Investigación","color":"#F59E0B"},{"id":"Resolved","title":"Resuelto","color":"#10B981"},{"id":"Closed","title":"Cerrado","color":"#334155"}],"default":"Open"}', true),
    (t_incidentes, NULL,       'Severidad',   'dropdown', 10, 130, '{"labels":[{"id":"Low","title":"Baja","color":"#10B981"},{"id":"Medium","title":"Media","color":"#F59E0B"},{"id":"High","title":"Alta","color":"#EF4444"},{"id":"Critical","title":"Crítica","color":"#7C3AED"}],"default":"Low"}', true),
    (t_incidentes, 'people',   'Responsable', 'people',   20, 160, '{"multiple":false}', true),
    (t_incidentes, 'date',     'Fecha',       'date',     30, 130, '{"includeTime":true}', true),
    (t_incidentes, NULL,       'Impacto',     'text',     40, 200, '{}', false),
    (t_incidentes, NULL,       'Área',        'text',     50, 150, '{}', false);

  INSERT INTO board_template_groups (template_id, title, color, position) VALUES
    (t_incidentes, 'Reportados',         '#EF4444', 0),
    (t_incidentes, 'En Investigación',   '#F59E0B', 10),
    (t_incidentes, 'Resueltos',          '#10B981', 20);

END $$;
