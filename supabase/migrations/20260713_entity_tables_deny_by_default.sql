-- ============================================================================
-- Endurecimiento RLS: entity_attachments y entity_history → deny-by-default
-- ============================================================================
-- Deuda de 20260706: ambas tablas quedaron con políticas USING (true) para
-- cualquier usuario autenticado, fuera del patrón get_user_board_role del
-- proyecto.
--
-- Evidencia (2026-07-01): 0 filas en ambas tablas; ningún código vivo las
-- consume (el único consumidor era el módulo work-orders, eliminado en
-- 20260712).
--
-- Se eliminan las políticas permisivas. RLS permanece ENABLED, así que sin
-- políticas todo acceso de anon/authenticated queda DENEGADO (service role
-- no se ve afectado). Las políticas definitivas, con alcance de tablero vía
-- get_user_board_role, se definirán cuando los módulos Actividades y
-- Verificación establezcan cómo se resuelve el board_id desde la entidad
-- polimórfica (entity_type/entity_id).
-- ============================================================================

DROP POLICY IF EXISTS "Todo el acceso a usuarios autenticados" ON public.entity_attachments;
DROP POLICY IF EXISTS "Todo el acceso a usuarios autenticados" ON public.entity_history;
