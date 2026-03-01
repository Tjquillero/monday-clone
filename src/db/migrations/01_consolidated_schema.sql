-- SAFE MIGRATION: Consolidated OKRs & Site Incidents
-- This script is idempotent (can be run multiple times safely)

-----------------------------------------------------------------------
-- 1. OKRs MODULE
-----------------------------------------------------------------------

-- Tables (Create if not exists)
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

CREATE TABLE IF NOT EXISTS okr_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  okr_id UUID REFERENCES okrs(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS (Enable)
ALTER TABLE okrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_links ENABLE ROW LEVEL SECURITY;

-- Policies (Drop & Recreate safely)
DROP POLICY IF EXISTS "Users can view general OKRs or their own personal ones" ON okrs;
CREATE POLICY "Users can view general OKRs or their own personal ones" ON okrs
  FOR SELECT USING (visibility = 'general' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can view links for OKRs they can see" ON okr_links;
CREATE POLICY "Users can view links for OKRs they can see" ON okr_links
  FOR SELECT USING (EXISTS (SELECT 1 FROM okrs WHERE id = okr_links.okr_id));

DROP POLICY IF EXISTS "Users can manage their own OKRs" ON okrs;
CREATE POLICY "Users can manage their own OKRs" ON okrs
  FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage links for their own OKRs" ON okr_links;
CREATE POLICY "Users can manage links for their own OKRs" ON okr_links
  FOR ALL USING (EXISTS (SELECT 1 FROM okrs WHERE id = okr_links.okr_id AND owner_id = auth.uid()));

-----------------------------------------------------------------------
-- 2. SITE INCIDENTS MODULE (Novedades de Obra)
-----------------------------------------------------------------------

-- Table (Create if not exists)
CREATE TABLE IF NOT EXISTS site_incidents (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  board_id text not null,
  group_id text not null,
  user_id uuid references auth.users not null,
  type text not null default 'General',
  severity text not null default 'Low',
  description text not null,
  photos text[] default array[]::text[],
  status text default 'Open'
);

-- RLS (Enable)
ALTER TABLE site_incidents ENABLE ROW LEVEL SECURITY;

-- Policies (Drop & Recreate safely)
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON site_incidents;
CREATE POLICY "Enable read access for all authenticated users" ON site_incidents
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert access for all authenticated users" ON site_incidents;
CREATE POLICY "Enable insert access for all authenticated users" ON site_incidents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for users based on user_id" ON site_incidents;
CREATE POLICY "Enable update for users based on user_id" ON site_incidents
  FOR UPDATE USING (auth.uid() = user_id);

-----------------------------------------------------------------------
-- 3. STORAGE (Evidence)
-----------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access to Evidence" ON storage.objects;
CREATE POLICY "Public Access to Evidence"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'evidence' );

DROP POLICY IF EXISTS "Authenticated Users can upload Evidence" ON storage.objects;
CREATE POLICY "Authenticated Users can upload Evidence"
  ON storage.objects FOR INSERT
  WITH CHECK ( bucket_id = 'evidence' AND auth.role() = 'authenticated' );

-----------------------------------------------------------------------
-- 4. REALTIME PUBLICATION (Safely Add Tables)
-----------------------------------------------------------------------

DO $$
BEGIN
  -- Check and add 'okrs'
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'okrs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE okrs;
  END IF;

  -- Check and add 'okr_links'
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'okr_links'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE okr_links;
  END IF;

  -- Check and add 'site_incidents'
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'site_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE site_incidents;
  END IF;
END;
$$;
