-- ============================================================================
-- Migración: 2026100101_operational_frequencies.sql
-- Propósito: Tabla public.operational_frequencies para frecuencias operativas (D19)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.operational_frequencies (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id          UUID         NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  group_id          UUID         NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  activity_key      TEXT         NOT NULL,
  visits_per_month  NUMERIC      NOT NULL CHECK (visits_per_month > 0),
  source            TEXT         NOT NULL CHECK (source IN ('CRONOGRAMA', 'POA')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (board_id, group_id, activity_key)
);

CREATE INDEX IF NOT EXISTS idx_operational_frequencies_board_group
  ON public.operational_frequencies (board_id, group_id);

CREATE INDEX IF NOT EXISTS idx_operational_frequencies_activity
  ON public.operational_frequencies (activity_key);

-- RLS
ALTER TABLE public.operational_frequencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operational_frequencies_select_board_members"
  ON public.operational_frequencies
  FOR SELECT
  TO authenticated
  USING (public.get_user_board_role(board_id, auth.uid()) IS NOT NULL);

-- Permisos estrictos: solo SELECT para authenticated
REVOKE ALL ON public.operational_frequencies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.operational_frequencies TO authenticated;

COMMENT ON TABLE public.operational_frequencies IS 'Frecuencias operativas en visitas/mes por sitio y actividad (D19). Usadas para la planificación semanal desacoplada del POA contractual.';
