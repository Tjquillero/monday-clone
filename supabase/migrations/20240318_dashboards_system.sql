-- Migration: Customizable Dashboards System
-- Created: 2024-03-18

-- 1. DASHBOARDS TABLE
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. DASHBOARD WIDGETS TABLE
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'scurve', 'budget-execution', 'task-list', 'incident-log', etc.
  title TEXT,
  config JSONB DEFAULT '{}'::jsonb, -- Filter settings, site_id, etc.
  layout JSONB DEFAULT '{}'::jsonb, -- x, y, w, h for react-grid-layout
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Policies for Dashboards
DROP POLICY IF EXISTS "Members can view dashboards" ON dashboards;
CREATE POLICY "Members can view dashboards" ON dashboards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = dashboards.board_id
      AND get_user_board_role(b.id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins can manage dashboards" ON dashboards;
CREATE POLICY "Admins can manage dashboards" ON dashboards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM boards b
      WHERE b.id = dashboards.board_id
      AND get_user_board_role(b.id, auth.uid()) = 'admin'
    )
  );

-- Policies for Widgets
DROP POLICY IF EXISTS "Members can view widgets" ON dashboard_widgets;
CREATE POLICY "Members can view widgets" ON dashboard_widgets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dashboards d
      JOIN boards b ON b.id = d.board_id
      WHERE d.id = dashboard_widgets.dashboard_id
      AND get_user_board_role(b.id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins can manage widgets" ON dashboard_widgets;
CREATE POLICY "Admins can manage widgets" ON dashboard_widgets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM dashboards d
      JOIN boards b ON b.id = d.board_id
      WHERE d.id = dashboard_widgets.dashboard_id
      AND get_user_board_role(b.id, auth.uid()) = 'admin'
    )
  );

-- 4. PERFORMANCE INDEXES
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dashboards_board_id ON dashboards(board_id);
CREATE INDEX IF NOT EXISTS idx_widgets_dashboard_id ON dashboard_widgets(dashboard_id);

-- 5. REALTIME CONFIGURATION
-- -----------------------------------------------------------------
-- Add to existing publication if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dashboards, dashboard_widgets;
  END IF;
END $$;
