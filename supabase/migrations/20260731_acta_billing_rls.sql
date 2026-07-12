-- =============================================================================
-- Incremento 5: RLS para actas / acta_items / acta_item_sources.
-- Ref: docs/architecture/acta-billing-design.md, sección "RLS" (inventario +
--      dependencia arquitectónica).
--
-- Inventario ya congelado (ver doc): las 3 tablas NO aceptan escritura
-- directa de NINGÚN rol, ni siquiera admin — toda escritura real pasa por
-- generate_acta_draft()/issue_acta() (SECURITY DEFINER, propietario
-- postgres con BYPASSRLS). Por eso las políticas de escritura no gradúan
-- por rol: son ausencia total de política (deny-by-default, mismo patrón
-- que 20260713_entity_tables_deny_by_default.sql) — la gradación admin vs.
-- resto ya vive dentro de las funciones de dominio.
--
-- NO agregar FORCE ROW LEVEL SECURITY a estas tablas: rompería el bypass
-- del que dependen generate_acta_draft()/issue_acta() (ver "Dependencia
-- arquitectónica" en el doc, verificado empíricamente antes de esta
-- migración).
-- =============================================================================

ALTER TABLE public.actas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acta_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acta_item_sources ENABLE ROW LEVEL SECURITY;

-- actas: lectura para cualquier miembro del board. Sin política de
-- escritura — INSERT/UPDATE/DELETE directos quedan denegados para
-- authenticated/anon (service_role y postgres no se ven afectados).
CREATE POLICY "Miembros pueden ver las actas de su board"
  ON public.actas FOR SELECT
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

-- acta_items: lectura para miembros del board, vía acta_id -> actas.board_id.
CREATE POLICY "Miembros pueden ver las líneas de acta de su board"
  ON public.acta_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.actas a
      WHERE a.id = acta_items.acta_id
        AND get_user_board_role(a.board_id, auth.uid()) IS NOT NULL
    )
  );

-- acta_item_sources: lectura para miembros del board, vía
-- acta_item_id -> acta_items.acta_id -> actas.board_id.
CREATE POLICY "Miembros pueden ver las fuentes de línea de acta de su board"
  ON public.acta_item_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.acta_items ai
      JOIN public.actas a ON a.id = ai.acta_id
      WHERE ai.id = acta_item_sources.acta_item_id
        AND get_user_board_role(a.board_id, auth.uid()) IS NOT NULL
    )
  );
