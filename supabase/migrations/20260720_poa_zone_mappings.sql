-- =============================================================================
-- poa_zone_mappings — Catálogo de zonas del POA con mapeo persistente al Board
-- Ref: docs/adr/ADR-0004-poa-zone-catalog.md, docs/architecture/poa-excel-import-design.md
--
-- El POA define el universo contractual; el Board define el universo
-- operativo. La relación entre el nombre de zona tal como aparece en el
-- Excel oficial del POA y un group_id real es siempre explícita y
-- persistente — nunca implícita por coincidencia de texto (ADR-0004).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.poa_zone_mappings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poa_id           UUID        NOT NULL REFERENCES public.poa(id) ON DELETE CASCADE,
  excel_zone_name  TEXT        NOT NULL,
  group_id         UUID        REFERENCES public.groups(id) ON DELETE SET NULL,
  created_by       UUID        NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un mismo nombre de zona del Excel resuelve siempre al mismo group_id
  -- dentro del mismo POA. Deliberadamente NO se restringe group_id a
  -- aparecer una sola vez: si el nombre de una zona cambia de una versión
  -- del Excel a otra, es legítimo que dos excel_zone_name distintos
  -- apunten al mismo group_id histórico.
  UNIQUE (poa_id, excel_zone_name)
);

-- Búsqueda inversa (¿qué zonas del POA apuntan a este group?) — Postgres no
-- crea este índice automáticamente solo por ser FK.
CREATE INDEX IF NOT EXISTS idx_poa_zone_mappings_group_id
  ON public.poa_zone_mappings (group_id);

-- Detección rápida de mapeos pendientes (group_id nulo = zona nueva nunca
-- vista, o group eliminado y a la espera de reasignación — Regla 5 de
-- ADR-0004). Consulta más frecuente de la pantalla de resolución.
CREATE INDEX IF NOT EXISTS idx_poa_zone_mappings_pending
  ON public.poa_zone_mappings (poa_id)
  WHERE group_id IS NULL;

-- =============================================================================
-- RLS — mismo patrón que el resto de tablas del dominio POA:
-- lectura para cualquier miembro del board (vía poa → board_id),
-- escritura solo admin.
-- =============================================================================

ALTER TABLE public.poa_zone_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros pueden ver mapeos de zona del POA"
  ON public.poa_zone_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.poa p
      WHERE p.id = poa_zone_mappings.poa_id
        AND get_user_board_role(p.board_id, auth.uid()) IS NOT NULL
    )
  );

CREATE POLICY "Solo admin gestiona mapeos de zona del POA"
  ON public.poa_zone_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.poa p
      WHERE p.id = poa_zone_mappings.poa_id
        AND get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.poa p
      WHERE p.id = poa_zone_mappings.poa_id
        AND get_user_board_role(p.board_id, auth.uid()) = 'admin'
    )
  );
