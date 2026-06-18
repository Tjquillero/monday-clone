-- 🏰 ESQUEMA MAESTRO DE PRODUCCIÓN: MANTENIX (SUPABASE)
-- Versión: 1.0.0 (Despliegue Táctico de Campo)
-- Fecha: 2026-03-28

-- 1. EXTENSIONES Y SEGURIDAD BASE
CREATE EXTENSION IF NOT EXISTS "moddatetime" SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLAS NUCLEARES (CORE)

-- Boards (Tableros Principales)
CREATE TABLE IF NOT EXISTS public.boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Groups (Sitios, Lotes, Zonas)
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    color TEXT DEFAULT '#3B7EF8',
    position FLOAT NOT NULL DEFAULT 0,
    capacity_jornales FLOAT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Items (Actividades Operativas)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position FLOAT NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'Working',
    prioridad TEXT DEFAULT 'Media',
    values JSONB DEFAULT '{}'::jsonb, -- Columnas dinámicas de Monday (frec, meta, cant, rend)
    daily_execution JSONB DEFAULT '{}'::jsonb, -- Historial de cumplimiento diario
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TRIGGERS DE ACTUALIZACIÓN AUTOMÁTICA (UPDATED_AT)

CREATE TRIGGER handle_updated_at_boards BEFORE UPDATE ON public.boards
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

CREATE TRIGGER handle_updated_at_groups BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

CREATE TRIGGER handle_updated_at_items BEFORE UPDATE ON public.items
FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

-- 4. POLÍTICAS DE SEGURIDAD RLS (ROW LEVEL SECURITY)

-- Activar RLS en todas las tablas
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Política de Lectura: Todos los usuarios autenticados pueden leer todo (ajustar luego por permisos de rol)
CREATE POLICY "Public Read Access" ON public.boards FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON public.items FOR SELECT USING (true);

-- Política de Escritura: Usuarios autenticados pueden manipular datos (según necesidad operativa)
CREATE POLICY "Admin All Permissions" ON public.boards FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin All Permissions" ON public.groups FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin All Permissions" ON public.items FOR ALL USING (auth.role() = 'authenticated');

-- 5. BUCKETS DE STORAGE (FOTOS DE AUDITORÍA)
-- Nota: Esto se configura usualmente en el dashboard, pero aquí definimos la política lógica:
-- Bucket Name: [execution_photos] | Acceso: Privado | RLS: Activado

-- 6. ÍNDICES DE RENDIMIENTO (PERFORMANCE)
CREATE INDEX idx_items_group_id ON public.items(group_id);
CREATE INDEX idx_groups_board_id ON public.groups(board_id);
CREATE INDEX idx_items_status ON public.items(status);

-- FIN DEL ESQUEMA
