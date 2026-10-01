-- ============================================================================
-- Migración: 2026100103_operational_params.sql
-- Propósito: Parámetros operativos por sitio (D21–D26 / GATE FREQ-OP-02)
--            - qty_mode y override de rendimiento en operational_frequencies
--            - tabla site_daily_capacity para límite de jornales por sitio
-- ============================================================================

-- 1. Ampliar operational_frequencies con qty_mode y override de rendimiento (D21, D23)
ALTER TABLE public.operational_frequencies
  ADD COLUMN IF NOT EXISTS qty_mode TEXT NOT NULL DEFAULT 'FULL' CHECK (qty_mode IN ('FULL', 'SPLIT')),
  ADD COLUMN IF NOT EXISTS rendimiento NUMERIC NULL CHECK (rendimiento IS NULL OR rendimiento > 0);

COMMENT ON COLUMN public.operational_frequencies.qty_mode IS 'Modo de cálculo de cantidad planificada: FULL (cantidad por visita) o SPLIT (cantidad total del mes repartida entre visitas, D21)';
COMMENT ON COLUMN public.operational_frequencies.rendimiento IS 'Override de rendimiento físico específico para este sitio y actividad (D23). Si es NULL, se usa el estándar del catálogo técnico.';

-- 2. Tabla de capacidad diaria de jornales por sitio (D24)
CREATE TABLE IF NOT EXISTS public.site_daily_capacity (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id          UUID         NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  group_id          UUID         NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  jornales_dia      NUMERIC      NOT NULL CHECK (jornales_dia > 0),
  source            TEXT         NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (board_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_site_daily_capacity_board_group
  ON public.site_daily_capacity (board_id, group_id);

-- RLS
ALTER TABLE public.site_daily_capacity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'site_daily_capacity' 
      AND policyname = 'site_daily_capacity_select_board_members'
  ) THEN
    CREATE POLICY "site_daily_capacity_select_board_members"
      ON public.site_daily_capacity
      FOR SELECT
      TO authenticated
      USING (public.get_user_board_role(board_id, auth.uid()) IS NOT NULL);
  END IF;
END $$;

-- Permisos estrictos: solo SELECT para authenticated y mantenix_auditor
REVOKE ALL ON public.site_daily_capacity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_daily_capacity TO authenticated;
GRANT SELECT ON public.site_daily_capacity TO mantenix_auditor;

COMMENT ON TABLE public.site_daily_capacity IS 'Límite de capacidad diaria en jornales por sitio (D24). Informativo en FREQ-OP-02 para auditoría y validación de sobrecarga.';
