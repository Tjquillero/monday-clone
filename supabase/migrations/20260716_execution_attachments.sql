-- =============================================================================
-- execution_attachments — evidencia fotográfica de Jornadas
-- Ref: docs/architecture/execution-certification-design.md (sección 7)
--
-- Investigación previa (no repetir el patrón huérfano):
--   - `attachments` (20240317_attachments_system.sql) es la convención REAL en
--     uso hoy (RLS vía get_user_board_role, consumida por useAttachments.ts /
--     ItemModal.tsx), pero item_id tiene FK dura a items(id) — no reutilizable
--     para weekly_plan_item_executions sin debilitar esa restricción.
--   - `entity_attachments` (20260706_work_orders_schema.sql) es la tabla
--     huérfana del módulo work_orders ya eliminado: deny-by-default, cero
--     consumidores. No se reactiva — se abandona definitivamente en favor de
--     esta tabla, que sigue el mismo patrón que `attachments` (FK dura + RLS
--     vía join), aplicado a weekly_plan_item_executions en vez de items.
--   - El bucket 'evidence' ya pertenece a site_incidents (NewsModal.tsx). Esta
--     tabla reutiliza el bucket 'attachments' (Storage), bajo el prefijo
--     execution/{execution_id}/, sin crear un tercer bucket.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.execution_attachments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  UUID        NOT NULL REFERENCES public.weekly_plan_item_executions(id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL,
  file_url      TEXT        NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  uploaded_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_attachments_execution_id
  ON public.execution_attachments (execution_id);

ALTER TABLE public.execution_attachments ENABLE ROW LEVEL SECURITY;

-- Mismo patrón de RLS que `attachments`: join hasta el board a través de la
-- cadena execution → plan_item → plan.
CREATE POLICY "Miembros pueden ver evidencia de ejecución"
  ON public.execution_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.weekly_plan_item_executions e
      JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
      JOIN public.weekly_plans wp     ON wp.id = i.plan_id
      WHERE e.id = execution_attachments.execution_id
        AND get_user_board_role(wp.board_id, auth.uid()) IS NOT NULL
    )
  );

CREATE POLICY "Miembros pueden subir evidencia de ejecución"
  ON public.execution_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.weekly_plan_item_executions e
      JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
      JOIN public.weekly_plans wp     ON wp.id = i.plan_id
      WHERE e.id = execution_attachments.execution_id
        AND get_user_board_role(wp.board_id, auth.uid()) IS NOT NULL
    )
  );

CREATE POLICY "Miembros pueden eliminar evidencia de ejecución"
  ON public.execution_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.weekly_plan_item_executions e
      JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
      JOIN public.weekly_plans wp     ON wp.id = i.plan_id
      WHERE e.id = execution_attachments.execution_id
        AND get_user_board_role(wp.board_id, auth.uid()) IS NOT NULL
    )
  );
