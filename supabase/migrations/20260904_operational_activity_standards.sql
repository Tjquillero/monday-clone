-- =============================================================================
-- Migration: 20260904_operational_activity_standards.sql
-- Description: Isolated Operational Standards Catalog for Resource Analysis V3
-- Governance: ADR-0010 Decoupling (Contractual POA vs Field Operational Standards)
-- =============================================================================

-- 1. Table: public.operational_activity_standards
CREATE TABLE IF NOT EXISTS public.operational_activity_standards (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key        TEXT        NOT NULL, -- e.g. 'puerto_colombia', 'playa_manglares', 'centro_gastronomico', etc.
  activity_key    TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  category        TEXT        NOT NULL CHECK (category IN ('ZONA VERDE', 'ZONA DURA', 'ZONA DE PLAYA')),
  unit            TEXT        NOT NULL,
  rendimiento     NUMERIC     NOT NULL CHECK (rendimiento > 0),
  frecuencia      NUMERIC     NOT NULL CHECK (frecuencia > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for site lookups
CREATE INDEX IF NOT EXISTS idx_ops_site_key ON public.operational_activity_standards (site_key, activity_key);

-- 2. Table: public.operational_scope_mappings
CREATE TABLE IF NOT EXISTS public.operational_scope_mappings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key        TEXT        NOT NULL,
  activity_key    TEXT        NOT NULL,
  scope_key       TEXT        NOT NULL,
  weight          NUMERIC     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osm_site_scope ON public.operational_scope_mappings (site_key, scope_key);

-- RLS Policies
ALTER TABLE public.operational_activity_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_scope_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to operational_activity_standards"
  ON public.operational_activity_standards FOR SELECT USING (true);

CREATE POLICY "Allow public read access to operational_scope_mappings"
  ON public.operational_scope_mappings FOR SELECT USING (true);
