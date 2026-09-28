-- =============================================================================
-- Migration: 20260912_module_2_machinery_resources.sql
-- Module 2: Machinery Catalog, Personnel Operator Qualifications & Finite Resource Persistence
-- Baseline: 2386465 + ADR-0007->ADR-0012 + Hito 4 Certified (c094406)
-- =============================================================================

-- 1. Create public.machinery (Catálogo de Maquinaria Finitos por Sitio)
CREATE TABLE IF NOT EXISTS public.machinery (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id                UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  code                    TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  category                TEXT        NOT NULL DEFAULT 'EQUIPO_MENOR', -- 'TRACTOR' | 'VOLQUETA' | 'MINICARGADOR' | 'GUADAÑA' | 'EQUIPO_MENOR'
  simultaneous_limit      INT         NOT NULL DEFAULT 1 CHECK (simultaneous_limit > 0),
  operator_required_role  TEXT        NULL, -- ej. 'TRACTORISTA', 'CONDUCTOR_VOLQUETA', 'GUADAÑADOR'
  operator_count          INT         NOT NULL DEFAULT 1 CHECK (operator_count >= 0),
  is_available            BOOLEAN     NOT NULL DEFAULT true, -- Retiro operacional (Soft-Retirement): is_available = false
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_machinery_board_code UNIQUE (board_id, code)
);

-- 2. Create public.personnel_qualifications (Habilitaciones Técnicas de Operador por Persona)
CREATE TABLE IF NOT EXISTS public.personnel_qualifications (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id       UUID        NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  qualification_role TEXT        NOT NULL, -- ej. 'TRACTORISTA', 'CONDUCTOR_VOLQUETA', 'GUADAÑADOR'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_personnel_qualification UNIQUE (personnel_id, qualification_role)
);

-- 3. Add machinery_id to public.weekly_plan_items with ON DELETE RESTRICT (Protección de Borrado Físico)
ALTER TABLE public.weekly_plan_items
  ADD COLUMN IF NOT EXISTS machinery_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_weekly_plan_items_machinery'
  ) THEN
    ALTER TABLE public.weekly_plan_items
      ADD CONSTRAINT fk_weekly_plan_items_machinery 
      FOREIGN KEY (machinery_id) REFERENCES public.machinery(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Triggers for updated_at
CREATE TRIGGER trig_machinery_updated_at
  BEFORE UPDATE ON public.machinery
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 5. Indexes for Operational Query Performance
CREATE INDEX IF NOT EXISTS idx_machinery_board ON public.machinery(board_id);
CREATE INDEX IF NOT EXISTS idx_personnel_qualifications_personnel ON public.personnel_qualifications(personnel_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_machinery ON public.weekly_plan_items(machinery_id);

-- 6. Granular Row Level Security (RLS) Policies per Operation and Canonical Roles (admin, member)
ALTER TABLE public.machinery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_qualifications ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies for public.machinery
CREATE POLICY "machinery_select_policy"
  ON public.machinery FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "machinery_insert_policy"
  ON public.machinery FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.board_members bm
      WHERE bm.board_id = public.machinery.board_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "machinery_update_policy"
  ON public.machinery FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.board_members bm
      WHERE bm.board_id = public.machinery.board_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.board_members bm
      WHERE bm.board_id = public.machinery.board_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "machinery_delete_policy"
  ON public.machinery FOR DELETE
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.board_members bm
      WHERE bm.board_id = public.machinery.board_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  );

-- 6.2 Policies for public.personnel_qualifications
CREATE POLICY "personnel_qualifications_select_policy"
  ON public.personnel_qualifications FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "personnel_qualifications_insert_policy"
  ON public.personnel_qualifications FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.personnel p
      JOIN public.personnel_site_assignments psa ON psa.personnel_id = p.id
      JOIN public.personnel_versions pv ON pv.id = psa.version_id
      JOIN public.board_members bm ON bm.board_id = pv.board_id
      WHERE p.id = public.personnel_qualifications.personnel_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "personnel_qualifications_update_policy"
  ON public.personnel_qualifications FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.personnel p
      JOIN public.personnel_site_assignments psa ON psa.personnel_id = p.id
      JOIN public.personnel_versions pv ON pv.id = psa.version_id
      JOIN public.board_members bm ON bm.board_id = pv.board_id
      WHERE p.id = public.personnel_qualifications.personnel_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.personnel p
      JOIN public.personnel_site_assignments psa ON psa.personnel_id = p.id
      JOIN public.personnel_versions pv ON pv.id = psa.version_id
      JOIN public.board_members bm ON bm.board_id = pv.board_id
      WHERE p.id = public.personnel_qualifications.personnel_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  );

CREATE POLICY "personnel_qualifications_delete_policy"
  ON public.personnel_qualifications FOR DELETE
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM public.personnel p
      JOIN public.personnel_site_assignments psa ON psa.personnel_id = p.id
      JOIN public.personnel_versions pv ON pv.id = psa.version_id
      JOIN public.board_members bm ON bm.board_id = pv.board_id
      WHERE p.id = public.personnel_qualifications.personnel_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'member')
    )
  );
