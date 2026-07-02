-- Migración SQL: Módulo de Órdenes de Trabajo (CMMS Relacional)

-- 1. Crear secuencia para número de orden
CREATE SEQUENCE IF NOT EXISTS public.work_order_number_seq;

-- 2. Crear tablas de catálogos (estados, prioridades, tipos)
CREATE TABLE IF NOT EXISTS public.work_order_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.work_order_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  sla_hours INTEGER NOT NULL DEFAULT 0 CHECK (sla_hours >= 0)
);

CREATE TABLE IF NOT EXISTS public.work_order_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_planned BOOLEAN NOT NULL DEFAULT false
);

-- 3. Crear tabla principal de órdenes de trabajo
CREATE TABLE IF NOT EXISTS public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number BIGINT NOT NULL DEFAULT nextval('public.work_order_number_seq'),
  display_number TEXT GENERATED ALWAYS AS ('OT-' || lpad(number::text, 6, '0')) STORED,
  title TEXT NOT NULL,
  description TEXT,
  status_id UUID REFERENCES public.work_order_statuses(id),
  priority_id UUID REFERENCES public.work_order_priorities(id),
  type_id UUID REFERENCES public.work_order_types(id),
  location TEXT,
  asset_id UUID, -- Referencia futura nullable
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  estimated_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_cost >= 0),
  actual_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (actual_cost >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT check_planned_dates CHECK (planned_end_at >= planned_start_at),
  CONSTRAINT check_execution_dates CHECK (completed_at >= started_at)
);

-- 4. Crear tabla de tareas (checklist items)
CREATE TABLE IF NOT EXISTS public.work_order_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  position INTEGER NOT NULL DEFAULT 0
);

-- 5. Crear tablas de insumos (materiales y repuestos)
CREATE TABLE IF NOT EXISTS public.work_order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  material_id UUID, -- Referencia futura nullable
  custom_name TEXT,
  estimated_qty NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (estimated_qty >= 0),
  actual_qty NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (actual_qty >= 0),
  unit TEXT NOT NULL DEFAULT 'Und',
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0)
);

CREATE TABLE IF NOT EXISTS public.work_order_spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  spare_part_id UUID, -- Referencia futura nullable
  custom_name TEXT,
  estimated_qty NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (estimated_qty >= 0),
  actual_qty NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (actual_qty >= 0),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_cost >= 0)
);

-- 6. Crear tabla de asignación con historial
CREATE TABLE IF NOT EXISTS public.work_order_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'technician',
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  removed_at TIMESTAMPTZ,
  removed_by UUID
);

-- 7. Crear tabla genérica de adjuntos reutilizable (entity_attachments)
CREATE TABLE IF NOT EXISTS public.entity_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  checksum TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ
);

-- 8. Crear tabla de comentarios con hilos
CREATE TABLE IF NOT EXISTS public.work_order_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.work_order_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Crear tabla de auditoría genérica
CREATE TABLE IF NOT EXISTS public.entity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID,
  event_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. Crear índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_work_orders_status_id ON public.work_orders(status_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_priority_id ON public.work_orders(priority_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_type_id ON public.work_orders(type_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_asset_id ON public.work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_at ON public.work_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_work_order_assignments_user_id ON public.work_order_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_work_order_assignments_work_order_id ON public.work_order_assignments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_entity_history_entity ON public.entity_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_history_created_at ON public.entity_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_attachments_entity ON public.entity_attachments(entity_type, entity_id);

-- 11. Crear función de trigger de auditoría genérica
CREATE OR REPLACE FUNCTION public.audit_entity_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_entity_type TEXT;
  v_entity_id UUID;
BEGIN
  -- Obtener user_id de la sesión de Supabase
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  v_entity_type := TG_ARGV[0];
  v_entity_id := NEW.id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.entity_history (entity_type, entity_id, user_id, event_type, field_name, old_value, new_value)
    VALUES (v_entity_type, v_entity_id, v_user_id, 'CREATED', NULL, NULL, 'Registro creado');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_entity_type = 'work_order' THEN
      IF OLD.status_id IS DISTINCT FROM NEW.status_id THEN
        INSERT INTO public.entity_history (entity_type, entity_id, user_id, event_type, field_name, old_value, new_value)
        VALUES (v_entity_type, v_entity_id, v_user_id, 'STATUS_CHANGED', 'status_id', OLD.status_id::text, NEW.status_id::text);
      END IF;

      IF OLD.priority_id IS DISTINCT FROM NEW.priority_id THEN
        INSERT INTO public.entity_history (entity_type, entity_id, user_id, event_type, field_name, old_value, new_value)
        VALUES (v_entity_type, v_entity_id, v_user_id, 'PRIORITY_CHANGED', 'priority_id', OLD.priority_id::text, NEW.priority_id::text);
      END IF;

      IF OLD.planned_end_at IS DISTINCT FROM NEW.planned_end_at THEN
        INSERT INTO public.entity_history (entity_type, entity_id, user_id, event_type, field_name, old_value, new_value)
        VALUES (v_entity_type, v_entity_id, v_user_id, 'DUE_DATE_CHANGED', 'planned_end_at', OLD.planned_end_at::text, NEW.planned_end_at::text);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Vincular trigger a la tabla work_orders
CREATE TRIGGER trg_audit_work_orders_insert
AFTER INSERT ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.audit_entity_change('work_order');

CREATE TRIGGER trg_audit_work_orders_update
AFTER UPDATE ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.audit_entity_change('work_order');

-- 13. Habilitar RLS en todas las tablas
ALTER TABLE public.work_order_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_history ENABLE ROW LEVEL SECURITY;

-- 14. Crear políticas RLS básicas para acceso autenticado
CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.work_order_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.work_order_priorities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir lectura a usuarios autenticados" ON public.work_order_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.work_orders FOR ALL TO authenticated USING (deleted_at IS NULL) WITH CHECK (deleted_at IS NULL);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.work_order_tasks FOR ALL TO authenticated USING (true);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.work_order_materials FOR ALL TO authenticated USING (true);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.work_order_spare_parts FOR ALL TO authenticated USING (true);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.work_order_assignments FOR ALL TO authenticated USING (true);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.entity_attachments FOR ALL TO authenticated USING (deleted_at IS NULL) WITH CHECK (deleted_at IS NULL);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.work_order_comments FOR ALL TO authenticated USING (true);
CREATE POLICY "Todo el acceso a usuarios autenticados" ON public.entity_history FOR SELECT TO authenticated USING (true);
