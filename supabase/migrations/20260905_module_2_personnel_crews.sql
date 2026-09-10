-- =============================================================================
-- Migration: 20260905_module_2_personnel_crews.sql
-- Module 2: Personnel Versioning, Site Assignments & Crew Management Nucleus
-- Baseline: 2386465 + ADR-0007->ADR-0012 + F3.1 (4084bcb)
-- =============================================================================

-- 1. Enhance public.personnel with persistent document_id
ALTER TABLE public.personnel 
  ADD COLUMN IF NOT EXISTS document_id TEXT UNIQUE;

-- 2. Create public.personnel_versions (Plantilla de Personal por Sitio/Período)
CREATE TABLE IF NOT EXISTS public.personnel_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id       UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  version_name   TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  effective_from DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create public.personnel_site_assignments (Adscripción Operacional por Sitio y Versión)
CREATE TABLE IF NOT EXISTS public.personnel_site_assignments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id            UUID        NOT NULL REFERENCES public.personnel_versions(id) ON DELETE CASCADE,
  personnel_id          UUID        NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  role_in_site          TEXT,
  zone                  TEXT        NOT NULL DEFAULT 'GENERAL',
  dedication_percentage NUMERIC     NOT NULL DEFAULT 100 CHECK (dedication_percentage > 0 AND dedication_percentage <= 100),
  daily_rate_override   NUMERIC     NULL CHECK (daily_rate_override IS NULL OR daily_rate_override >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_personnel_version_assignment UNIQUE (version_id, personnel_id, zone)
);

-- 4. Create public.crews (Catálogo de Cuadrillas por Sitio y Versión)
CREATE TABLE IF NOT EXISTS public.crews (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  version_id UUID        NULL REFERENCES public.personnel_versions(id) ON DELETE SET NULL,
  name       TEXT        NOT NULL,
  code       TEXT        NULL,
  leader_id  UUID        NULL REFERENCES public.personnel(id) ON DELETE SET NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_crew_board_name UNIQUE (board_id, name)
);

-- 5. Create public.crew_members (Pertenencia Pura a la Cuadrilla desde Adscripciones)
CREATE TABLE IF NOT EXISTS public.crew_members (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id                 UUID        NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  personnel_assignment_id UUID        NOT NULL REFERENCES public.personnel_site_assignments(id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_crew_member UNIQUE (crew_id, personnel_assignment_id)
);

-- 6. Add Foreign Key Constraint from weekly_plan_items.crew_id to public.crews(id)
ALTER TABLE public.weekly_plan_items
  ADD COLUMN IF NOT EXISTS crew_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_weekly_plan_items_crew'
  ) THEN
    ALTER TABLE public.weekly_plan_items
      ADD CONSTRAINT fk_weekly_plan_items_crew 
      FOREIGN KEY (crew_id) REFERENCES public.crews(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 7. Triggers for updated_at
CREATE TRIGGER trig_personnel_versions_updated_at
  BEFORE UPDATE ON public.personnel_versions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TRIGGER trig_personnel_site_assignments_updated_at
  BEFORE UPDATE ON public.personnel_site_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TRIGGER trig_crews_updated_at
  BEFORE UPDATE ON public.crews
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 8. Indexes for Operational Query Performance
CREATE INDEX IF NOT EXISTS idx_personnel_versions_board ON public.personnel_versions(board_id);
CREATE INDEX IF NOT EXISTS idx_personnel_site_assignments_version ON public.personnel_site_assignments(version_id);
CREATE INDEX IF NOT EXISTS idx_personnel_site_assignments_personnel ON public.personnel_site_assignments(personnel_id);
CREATE INDEX IF NOT EXISTS idx_crews_board ON public.crews(board_id);
CREATE INDEX IF NOT EXISTS idx_crews_version ON public.crews(version_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON public.crew_members(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_assignment ON public.crew_members(personnel_assignment_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_crew ON public.weekly_plan_items(crew_id);

-- 9. Row Level Security (RLS)
ALTER TABLE public.personnel_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable authenticated access for personnel_versions"
  ON public.personnel_versions FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable authenticated access for personnel_site_assignments"
  ON public.personnel_site_assignments FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable authenticated access for crews"
  ON public.crews FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable authenticated access for crew_members"
  ON public.crew_members FOR ALL USING (auth.role() = 'authenticated');
