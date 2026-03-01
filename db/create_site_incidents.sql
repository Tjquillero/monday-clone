-- Create table for Site Incidents (Novedades)
CREATE TABLE IF NOT EXISTS site_incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL, -- The "Site"
  user_id UUID REFERENCES auth.users(id),
  photos TEXT[], -- Array of photo URLs
  description TEXT,
  severity TEXT DEFAULT 'Low', -- Low, Medium, Critical
  status TEXT DEFAULT 'Open', -- Open, Resolved, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE site_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON site_incidents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON site_incidents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for users based on user_id" ON site_incidents
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Enable delete for users based on user_id" ON site_incidents
  FOR DELETE USING (auth.uid() = user_id);
