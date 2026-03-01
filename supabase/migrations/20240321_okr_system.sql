/* Tabla de OKRs */
CREATE TABLE IF NOT EXISTS okrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  icon TEXT,
  color TEXT,
  visibility TEXT DEFAULT 'general' CHECK (visibility IN ('personal', 'general')),
  owner_id UUID REFERENCES auth.users(id),
  progress NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

/* Tabla de Vínculos de OKR */
CREATE TABLE IF NOT EXISTS okr_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  okr_id UUID REFERENCES okrs(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

/* Políticas de Seguridad (RLS) */
ALTER TABLE okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_links ENABLE ROW LEVEL SECURITY;

/* Políticas de Lectura */
DROP POLICY IF EXISTS "Users can view general OKRs or their own personal ones" ON okrs;
CREATE POLICY "Users can view general OKRs or their own personal ones" ON okrs
  FOR SELECT USING (visibility = 'general' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can view links for OKRs they can see" ON okr_links;
CREATE POLICY "Users can view links for OKRs they can see" ON okr_links
  FOR SELECT USING (EXISTS (SELECT 1 FROM okrs WHERE id = okr_links.okr_id));

/* Políticas de Escritura */
DROP POLICY IF EXISTS "Users can manage their own OKRs" ON okrs;
CREATE POLICY "Users can manage their own OKRs" ON okrs
  FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage links for their own OKRs" ON okr_links;
CREATE POLICY "Users can manage links for their own OKRs" ON okr_links
  FOR ALL USING (EXISTS (SELECT 1 FROM okrs WHERE id = okr_links.okr_id AND owner_id = auth.uid()));

/* Tiempo Real */
ALTER PUBLICATION supabase_realtime ADD TABLE okrs;
ALTER PUBLICATION supabase_realtime ADD TABLE okr_links;
