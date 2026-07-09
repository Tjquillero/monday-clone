-- =============================================================================
-- Esquema del Dominio POA — Migración SQL
-- Ref: docs/domain/poa-domain.md (Congelado v1), docs/adr/ADR-0002-schedule-contractual-source.md
--
-- Tablas nuevas:
--   poa                — instrumento contractual (uno por contrato/board)
--   poa_versions        — instantánea contractual aprobada (snapshot atómico)
--   poa_activities       — Actividad del POA (frecuencia, precio_unitario)
--   poa_activity_zones   — Cobertura por Zona (cantidad_contratada)
--
-- Modificaciones:
--   board_activity_standards: DROP frecuencia (pasa a poa_activities.frecuencia).
--     `priority` se conserva aquí como decisión pragmática: ADR-0002 dice que
--     no es contractual y no debe vivir en poa_activities, pero schedule-domain.md
--     todavía no define una tabla propia para parámetros de planificación.
--     Revisar cuando ese subdominio madure (ver docs/architecture/schedule-mapping.md).
--   weekly_plan_items: activity_standard_id → poa_activity_zone_id.
--     Sin backfill: 0 filas reales en weekly_plan_items a la fecha de este ADR.
-- =============================================================================

-- =============================================================================
-- 1. poa — instrumento contractual (uno por contrato)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.poa (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (board_id)
);

-- =============================================================================
-- 2. poa_versions — instantánea contractual aprobada (línea base inmutable)
--
-- Solo una versión 'active' por poa_id (Regla 12: Versión Activa Única).
-- 'active' es la única que puede usarse para generar nuevos Planes Semanales
-- (Regla 2 de poa-domain.md). Publicar una nueva versión cierra la anterior.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.poa_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_id         UUID        NOT NULL REFERENCES public.poa(id) ON DELETE CASCADE,
  version_number INT         NOT NULL CHECK (version_number > 0),
  status         TEXT        NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'active', 'closed')),

  published_by   UUID        REFERENCES auth.users(id),
  published_at   TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,

  created_by     UUID        NOT NULL REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (poa_id, version_number)
);

-- Invariante: una sola versión 'active' por poa_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_versions_one_active
  ON public.poa_versions (poa_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_poa_versions_poa
  ON public.poa_versions (poa_id);

-- =============================================================================
-- 3. poa_activities — Actividad del POA (Regla 17: precio inmutable;
--    Regla 18: frecuencia inmutable, dentro de la vigencia de la versión)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.poa_activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_version_id  UUID        NOT NULL REFERENCES public.poa_versions(id) ON DELETE CASCADE,
  activity_key    TEXT        NOT NULL,
  frecuencia      NUMERIC     NOT NULL CHECK (frecuencia > 0),
  precio_unitario NUMERIC     NOT NULL CHECK (precio_unitario >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (poa_version_id, activity_key)
);

CREATE INDEX IF NOT EXISTS idx_poa_activities_version
  ON public.poa_activities (poa_version_id);

-- =============================================================================
-- 4. poa_activity_zones — Cobertura por Zona (cantidad contratada)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.poa_activity_zones (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_activity_id    UUID        NOT NULL REFERENCES public.poa_activities(id) ON DELETE CASCADE,
  zone_id            UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  cantidad_contratada NUMERIC    NOT NULL CHECK (cantidad_contratada >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (poa_activity_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_poa_activity_zones_activity
  ON public.poa_activity_zones (poa_activity_id);

CREATE INDEX IF NOT EXISTS idx_poa_activity_zones_zone
  ON public.poa_activity_zones (zone_id);

-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE public.poa                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poa_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poa_activities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poa_activity_zones ENABLE ROW LEVEL SECURITY;

-- poa: lectura para cualquier miembro del board; escritura solo admin
CREATE POLICY "Miembros pueden ver el POA"
  ON public.poa FOR SELECT
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

CREATE POLICY "Solo admin gestiona el POA"
  ON public.poa FOR ALL
  USING (get_user_board_role(board_id, auth.uid()) = 'admin')
  WITH CHECK (get_user_board_role(board_id, auth.uid()) = 'admin');

-- poa_versions: lectura para miembros del board vía poa; escritura solo admin
CREATE POLICY "Miembros pueden ver versiones del POA"
  ON public.poa_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.poa p
      WHERE p.id = poa_versions.poa_id
        AND get_user_board_role(p.board_id, auth.uid()) IS NOT NULL
    )
  );

CREATE POLICY "Solo admin gestiona versiones del POA"
  ON public.poa_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.poa p
      WHERE p.id = poa_versions.poa_id
        AND get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.poa p
      WHERE p.id = poa_versions.poa_id
        AND get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  );

-- poa_activities: lectura para miembros del board vía poa_versions → poa; escritura solo admin
CREATE POLICY "Miembros pueden ver actividades del POA"
  ON public.poa_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.poa_versions pv
      JOIN   public.poa p ON p.id = pv.poa_id
      WHERE  pv.id = poa_activities.poa_version_id
        AND  get_user_board_role(p.board_id, auth.uid()) IS NOT NULL
    )
  );

CREATE POLICY "Solo admin gestiona actividades del POA"
  ON public.poa_activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.poa_versions pv
      JOIN   public.poa p ON p.id = pv.poa_id
      WHERE  pv.id = poa_activities.poa_version_id
        AND  get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.poa_versions pv
      JOIN   public.poa p ON p.id = pv.poa_id
      WHERE  pv.id = poa_activities.poa_version_id
        AND  get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  );

-- poa_activity_zones: lectura para miembros del board; escritura solo admin
CREATE POLICY "Miembros pueden ver coberturas por zona del POA"
  ON public.poa_activity_zones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.poa_activities pa
      JOIN   public.poa_versions pv ON pv.id = pa.poa_version_id
      JOIN   public.poa p           ON p.id  = pv.poa_id
      WHERE  pa.id = poa_activity_zones.poa_activity_id
        AND  get_user_board_role(p.board_id, auth.uid()) IS NOT NULL
    )
  );

CREATE POLICY "Solo admin gestiona coberturas por zona del POA"
  ON public.poa_activity_zones FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.poa_activities pa
      JOIN   public.poa_versions pv ON pv.id = pa.poa_version_id
      JOIN   public.poa p           ON p.id  = pv.poa_id
      WHERE  pa.id = poa_activity_zones.poa_activity_id
        AND  get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.poa_activities pa
      JOIN   public.poa_versions pv ON pv.id = pa.poa_version_id
      JOIN   public.poa p           ON p.id  = pv.poa_id
      WHERE  pa.id = poa_activity_zones.poa_activity_id
        AND  get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  );

-- =============================================================================
-- 6. board_activity_standards — retirar frecuencia (pasa a poa_activities)
--
-- `priority` se conserva aquí (ver nota de cabecera). Solo se retira lo que
-- ADR-0002 identifica como inequívocamente contractual.
-- =============================================================================

ALTER TABLE public.board_activity_standards
  DROP COLUMN IF EXISTS frecuencia;

-- =============================================================================
-- 7. weekly_plan_items — repuntar hacia la fuente contractual objetivo
--
-- Sin backfill: verificado por consulta real (ver ADR-0002) que
-- weekly_plan_items tiene 0 filas a la fecha de esta migración.
-- =============================================================================

ALTER TABLE public.weekly_plan_items
  DROP COLUMN IF EXISTS activity_standard_id;

ALTER TABLE public.weekly_plan_items
  ADD COLUMN IF NOT EXISTS poa_activity_zone_id UUID
    NOT NULL REFERENCES public.poa_activity_zones(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_poa_activity_zone
  ON public.weekly_plan_items (poa_activity_zone_id);
