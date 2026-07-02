-- Semillas (Seeds) para catálogos de Órdenes de Trabajo (CMMS)

-- 1. Semillas para Estados (work_order_statuses)
INSERT INTO public.work_order_statuses (key, name, color, position, is_default, is_closed) VALUES
('draft', 'Borrador', '#9ca3af', 1, true, false),
('scheduled', 'Programada', '#60a5fa', 2, false, false),
('assigned', 'Asignada', '#f59e0b', 3, false, false),
('executing', 'En Ejecución', '#3b82f6', 4, false, false),
('paused', 'Pausada', '#ef4444', 5, false, false),
('completed', 'Finalizada', '#10b981', 6, false, true),
('cancelled', 'Cancelada', '#374151', 7, false, true)
ON CONFLICT (key) DO NOTHING;

-- 2. Semillas para Prioridades (work_order_priorities)
INSERT INTO public.work_order_priorities (key, name, color, position, sla_hours) VALUES
('low', 'Baja', '#10b981', 1, 72),
('medium', 'Media', '#3b82f6', 2, 24),
('high', 'Alta', '#f59e0b', 3, 4),
('critical', 'Crítica', '#ef4444', 4, 1)
ON CONFLICT (key) DO NOTHING;

-- 3. Semillas para Tipos (work_order_types)
INSERT INTO public.work_order_types (key, name, is_planned) VALUES
('preventive', 'Preventivo', true),
('corrective', 'Correctivo', false),
('predictive', 'Predictivo', true)
ON CONFLICT (key) DO NOTHING;
