-- EJECUTAR ESTO EN EL SQL EDITOR DE SUPABASE PARA HABILITAR MAPAS COMPLETOS

-- 1. Agregar columnas de geolocalización a las tareas (items)
ALTER TABLE items ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE items ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 2. Agregar columnas de geolocalización a los sitios/grupos (groups)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 3. Inhabilitar RLS temporalmente si persiste el problema de visibilidad (Opcional - Usar con cuidado)
-- ALTER TABLE boards DISABLE ROW LEVEL SECURITY;
