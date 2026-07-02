-- ============================================================================
-- Limpieza del módulo Work Orders (retirado de la aplicación el 2026-07-01)
-- ============================================================================
-- Decisión de dominio: el proceso real no tiene "órdenes de trabajo".
-- Flujo: Cronograma (asistente) → Actividades (líder) → Verificación (supervisor).
--
-- Evidencia previa al DROP (inspección de catálogos en la base enlazada):
--   - audit_entity_change(): invocada ÚNICAMENTE por los 2 triggers de
--     work_orders; ninguna otra función la referencia.
--   - Ninguna vista depende de tablas work_order*.
--   - Único FK externo: activity_performance_observations.work_order_id
--     (nullable, ON DELETE SET NULL, 0 filas, ningún código vivo lo usa;
--     los hooks y close_weekly_plan nunca lo escriben). Se elimina la columna.
--   - Datos existentes: solo seeds de 20260707 (1 orden de prueba, catálogos).
--
-- SE CONSERVAN las tablas genéricas polimórficas (creadas en 20260706),
-- reutilizables por los futuros módulos Actividades y Verificación:
--   - public.entity_attachments  (adjuntos por entity_type/entity_id)
--   - public.entity_history      (auditoría por entity_type/entity_id)
--   PENDIENTE: endurecer sus políticas RLS al patrón get_user_board_role
--   (hoy son USING (true) para cualquier usuario autenticado).
-- ============================================================================

-- 1. Quitar el enlace de trazabilidad desde el motor de planificación.
--    Droppear la columna elimina también su FK y el índice parcial
--    idx_apo_work_order.
ALTER TABLE public.activity_performance_observations
  DROP COLUMN IF EXISTS work_order_id;

-- 2. Tablas hijas primero (las FK internas tienen ON DELETE CASCADE, pero el
--    orden explícito hace la migración legible y a prueba de cambios).
DROP TABLE IF EXISTS public.work_order_comments;
DROP TABLE IF EXISTS public.work_order_assignments;
DROP TABLE IF EXISTS public.work_order_spare_parts;
DROP TABLE IF EXISTS public.work_order_materials;
DROP TABLE IF EXISTS public.work_order_tasks;
DROP TABLE IF EXISTS public.work_orders;

-- 3. Catálogos.
DROP TABLE IF EXISTS public.work_order_statuses;
DROP TABLE IF EXISTS public.work_order_priorities;
DROP TABLE IF EXISTS public.work_order_types;

-- 4. Función de auditoría: solo la invocaban los triggers de work_orders
--    (caídos con la tabla) y su rama UPDATE es específica de work_order.
--    Se recreará adaptada cuando exista el módulo Actividades
--    (referencia en scratch/legacy/work-orders/).
DROP FUNCTION IF EXISTS public.audit_entity_change();

-- 5. Historial huérfano del módulo eliminado (3 filas de la orden de prueba).
DELETE FROM public.entity_history WHERE entity_type = 'work_order';
