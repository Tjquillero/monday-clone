-- Tabla para almacenar habilidades de IA y sus instrucciones dinámicas
-- Se usa para que un agente pueda recibir nuevas órdenes sin tocar el código fuente.

CREATE TABLE IF NOT EXISTS ai_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- Nombre de la habilidad
  instructions TEXT NOT NULL, -- El prompt o instrucciones
  version INTEGER DEFAULT 1, -- Versión de la instrucción
  active BOOLEAN DEFAULT true, -- Si está activa
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(name, version) -- Necesario para el versionado histórico
);

-- Índice para búsqueda rápida por nombre y versión
CREATE INDEX IF NOT EXISTS idx_ai_skills_name_version ON ai_skills(name, version DESC);

-- Permisos básicos para lectura/escritura (si se usan políticas RLS)
ALTER TABLE ai_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON ai_skills FOR SELECT USING (true);
CREATE POLICY "Allow authenticated full control" ON ai_skills FOR ALL USING (auth.role() = 'authenticated');

-- Datos iniciales para que el test funcione de inmediato
INSERT INTO ai_skills (name, instructions, version, active) 
VALUES ('test_skill', 'Eres un experto en agronomía para Mantenix. Tu objetivo es optimizar los rendimientos de actividades agrícolas.', 1, true)
ON CONFLICT (name, version) DO NOTHING;
