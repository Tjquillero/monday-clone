-- =============================================================================
-- Maintenance Scheduling Engine — Migración SQL
-- Ref: docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md
--
-- Tablas:
--   board_activity_standards        — estándares del contrato (colapsado catálogo)
--   activity_scope_mappings         — join activity_key ↔ scope_key
--   activity_performance_observations — rendimiento observado por ejecución
--
-- Modificaciones:
--   work_orders.activity_key TEXT   — trazabilidad OT → actividad programada
-- =============================================================================

-- =============================================================================
-- 1. board_activity_standards
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.board_activity_standards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contrato y sitio
  board_id        UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  group_id        UUID        REFERENCES public.groups(id) ON DELETE CASCADE,
  -- NULL = estándar del contrato; UUID = excepción del sitio

  -- Identidad semántica y presentación
  activity_key    TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  category        TEXT        NOT NULL
                  CHECK (category IN ('ZONA VERDE', 'ZONA DURA', 'ZONA DE PLAYA')),
  unit            TEXT        NOT NULL,

  -- Valores del contrato
  rendimiento     NUMERIC     NOT NULL CHECK (rendimiento > 0),
  frecuencia      NUMERIC     NOT NULL CHECK (frecuencia > 0),
  priority        TEXT        NOT NULL DEFAULT 'preferred'
                  CHECK (priority IN ('must_execute', 'preferred', 'flexible')),

  -- Historial de versiones (INSERT-only, nunca UPDATE)
  version         INT         NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_from  DATE        NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  source          TEXT        NOT NULL DEFAULT 'operational_manual',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_bas_effective_dates
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Índices de unicidad histórica
-- Dos índices parciales porque PostgreSQL trata NULL != NULL en UNIQUE
-- Solo una fila activa por actividad a nivel de contrato
CREATE UNIQUE INDEX IF NOT EXISTS idx_bas_active_contract
  ON public.board_activity_standards (board_id, activity_key, effective_from)
  WHERE group_id IS NULL AND effective_to IS NULL;

-- Solo una fila activa por actividad a nivel de sitio
CREATE UNIQUE INDEX IF NOT EXISTS idx_bas_active_site
  ON public.board_activity_standards (board_id, group_id, activity_key, effective_from)
  WHERE group_id IS NOT NULL AND effective_to IS NULL;

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_bas_board_active
  ON public.board_activity_standards (board_id, activity_key)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_bas_group
  ON public.board_activity_standards (group_id)
  WHERE group_id IS NOT NULL;

-- =============================================================================
-- 2. Trigger — Invariante de versión única vigente
--    Al insertar un nuevo estándar, cierra automáticamente el anterior.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_close_previous_activity_standard()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.board_activity_standards
  SET    effective_to = NEW.effective_from - INTERVAL '1 day'
  WHERE  board_id     = NEW.board_id
    AND  activity_key = NEW.activity_key
    AND  (
           (group_id IS NULL AND NEW.group_id IS NULL)
           OR (group_id = NEW.group_id)
         )
    AND  effective_to IS NULL
    AND  id != NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_close_previous_activity_standard ON public.board_activity_standards;
CREATE TRIGGER trg_close_previous_activity_standard
BEFORE INSERT ON public.board_activity_standards
FOR EACH ROW EXECUTE FUNCTION public.fn_close_previous_activity_standard();

-- =============================================================================
-- 3. activity_scope_mappings
--    Join global activity_key → scope_key de resource_analysis.scope_data
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_scope_mappings (
  activity_key    TEXT        NOT NULL,
  scope_key       TEXT        NOT NULL,
  weight          NUMERIC     NOT NULL DEFAULT 1.0 CHECK (weight > 0),

  PRIMARY KEY (activity_key, scope_key)
);

-- =============================================================================
-- 4. activity_performance_observations
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_performance_observations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_key          TEXT        NOT NULL,
  work_order_id         UUID        REFERENCES public.work_orders(id) ON DELETE SET NULL,
  board_id              UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  group_id              UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  observed_rendimiento  NUMERIC     NOT NULL CHECK (observed_rendimiento > 0),
  qty_executed          NUMERIC     CHECK (qty_executed > 0),
  jornales_used         NUMERIC     CHECK (jornales_used > 0),
  observation_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  source                TEXT        NOT NULL DEFAULT 'execution_record',
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apo_board_activity
  ON public.activity_performance_observations (board_id, activity_key, observation_date DESC);

CREATE INDEX IF NOT EXISTS idx_apo_work_order
  ON public.activity_performance_observations (work_order_id)
  WHERE work_order_id IS NOT NULL;

-- =============================================================================
-- 5. work_orders — agregar activity_key para trazabilidad
-- =============================================================================

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS activity_key TEXT;
-- NULL = OT correctiva sin actividad programada

-- =============================================================================
-- 6. RLS
-- =============================================================================

ALTER TABLE public.board_activity_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_scope_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_performance_observations ENABLE ROW LEVEL SECURITY;

-- board_activity_standards: acceso según membresía al board
CREATE POLICY "Miembros del board pueden ver estándares"
  ON public.board_activity_standards FOR SELECT
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

CREATE POLICY "Admins del board pueden gestionar estándares"
  ON public.board_activity_standards FOR INSERT
  WITH CHECK (get_user_board_role(board_id, auth.uid()) IN ('admin', 'member'));

-- Nunca UPDATE ni DELETE — versioning por INSERT
-- (Se omiten políticas de UPDATE y DELETE intencionalmente)

-- activity_scope_mappings: catálogo de solo lectura para todos los autenticados
CREATE POLICY "Lectura pública de scope mappings"
  ON public.activity_scope_mappings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins pueden gestionar scope mappings"
  ON public.activity_scope_mappings FOR ALL
  TO authenticated USING (true);

-- activity_performance_observations: igual que board_activity_standards
CREATE POLICY "Miembros pueden ver observaciones de rendimiento"
  ON public.activity_performance_observations FOR SELECT
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

CREATE POLICY "Miembros pueden registrar observaciones"
  ON public.activity_performance_observations FOR INSERT
  WITH CHECK (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

-- =============================================================================
-- 7. Seed — activity_scope_mappings (global, independiente del board)
-- =============================================================================

INSERT INTO public.activity_scope_mappings (activity_key, scope_key, weight) VALUES
  ('limpieza_general',              'total_paisajismo',   1.0),
  ('op_guadana',                    'grama',              1.0),
  ('riego_grama',                   'grama',              1.0),
  ('insecticida_fungicida_grama',   'grama',              1.0),
  ('herbicida_grama',               'grama',              1.0),
  ('fertilizacion_grama',           'grama',              1.0),
  ('plateo',                        'arbustos',           1.0),
  ('poda_arbustos',                 'arbustos',           1.0),
  ('mantenimiento_cama_siembra',    'arbustos',           1.0),
  ('riego_arbustos',                'arbustos',           1.0),
  ('insecticida_fungicida_arbustos','arbustos',           1.0),
  ('fertilizacion_arbustos',        'arbustos',           1.0),
  ('poda_arboles_palmas',           'arboles',            1.0),
  ('riego_arboles',                 'arboles',            1.0),
  ('insecticida_fungicida_arboles', 'arboles',            1.0),
  ('fertilizacion_arboles_comp',    'arboles',            1.0),
  ('fertilizacion_arboles_quim',    'arboles',            1.0),
  ('limpieza_zona_dura',            'zona_dura',          1.0),
  ('limpieza_marmol',               'limpieza_marmol',    1.0),
  ('limpieza_playa',                'zona_playa',         1.0),
  ('trasiego_playa',                'trasiego_playa',     1.0),
  ('limpieza_manual_extra',         'limpieza_manual',    1.0),
  ('corte_troncos',                 'corte_troncos',      1.0)
ON CONFLICT (activity_key, scope_key) DO NOTHING;

-- =============================================================================
-- board_activity_standards seed
-- Se inserta en tiempo de ejecución (Commit 4 / ResourceEfficiencyWidget)
-- cuando el board_id está disponible. No se puede sembrar aquí sin board_id.
-- Ver: docs/MAINTENANCE_SCHEDULING_ENGINE_v1.md — Fases de Implementación
-- =============================================================================
