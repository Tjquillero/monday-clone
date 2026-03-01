-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BASE TABLES
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  favorite BOOLEAN DEFAULT FALSE,
  owner_id UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS board_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  width INTEGER DEFAULT 150,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT DEFAULT '#c4c4c4',
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  values JSONB DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. AUXILIARY TABLES
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  source_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  target_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'finish_to_start',
  lag INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(source_item_id, target_item_id),
  CHECK (source_item_id != target_item_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT,
  rend FLOAT,
  category TEXT,
  zone TEXT CHECK (zone IN ('Zonas Verdes', 'Zonas Duras', 'Zona de Playa')),
  unit_price NUMERIC DEFAULT 0,
  frequency NUMERIC DEFAULT 25,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personnel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT,
  default_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    site_id TEXT NOT NULL,
    scope_data JSONB DEFAULT '{}'::jsonb,
    workers_data JSONB DEFAULT '{}'::jsonb,
    wages_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(board_id, site_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    read BOOLEAN DEFAULT FALSE,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. HELPER FUNCTIONS
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_board_role(p_board_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM board_members 
    WHERE board_id = p_board_id AND user_id = p_user_id;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_templates ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies Setup
DROP POLICY IF EXISTS "Users can see boards they are members of" ON boards;
CREATE POLICY "Users can see boards they are members of" ON boards
  FOR SELECT USING (get_user_board_role(id, auth.uid()) IS NOT NULL OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage boards" ON boards;
CREATE POLICY "Admins can manage boards" ON boards
  FOR ALL USING (get_user_board_role(id, auth.uid()) = 'admin' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Members can manage groups" ON groups;
CREATE POLICY "Members can manage groups" ON groups
  FOR ALL USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Members can manage items" ON items;
CREATE POLICY "Members can manage items" ON items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM groups g 
      WHERE g.id = items.group_id 
      AND get_user_board_role(g.board_id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Standard access for auxiliary tables" ON activity_templates;
CREATE POLICY "Standard access for auxiliary tables" ON activity_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users manage templates" ON activity_templates;
CREATE POLICY "Authenticated users manage templates" ON activity_templates FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Own notifications" ON notifications;
CREATE POLICY "Own notifications" ON notifications FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Auth access for public tables" ON personnel;
CREATE POLICY "Auth access for public tables" ON personnel FOR ALL TO authenticated USING (true);

-- 5. PERFORMANCE INDEXES
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_items_group_id ON items(group_id);
CREATE INDEX IF NOT EXISTS idx_items_parent_id ON items(parent_id);
CREATE INDEX IF NOT EXISTS idx_items_values_gin ON items USING GIN (values);
CREATE INDEX IF NOT EXISTS idx_groups_board_id ON groups(board_id);
CREATE INDEX IF NOT EXISTS idx_board_columns_board_id ON board_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_deps_source ON task_dependencies(source_item_id);
CREATE INDEX IF NOT EXISTS idx_deps_target ON task_dependencies(target_item_id);

-- 6. REALTIME CONFIGURATION
-- -----------------------------------------------------------------
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE boards, board_members, groups, items, board_columns, notifications, task_dependencies;
COMMIT;

-- 7. SEED DATA (Only if empty)
-- -----------------------------------------------------------------
INSERT INTO activity_templates (name, unit, rend, category)
SELECT * FROM (VALUES
  ('ACOPIO Y LIMPIEZA MANUAL', 'M2', 3000.0, 'Limpieza'),
  ('TRAZO Y NIVELACION (EJE)', 'M', 1500.0, 'Preliminares'),
  ('EXCAVACION MANUAL EN MATERIAL II', 'M3', 3.5, 'Cimentación'),
  ('PLANTILLA DE CONCRETO F''C 100 KG/CM2', 'M2', 15.0, 'Cimentación'),
  ('LIMPIEZA DE TERRENO POR MEDIOS MANUALES', 'M2', 40.0, 'Preliminares'),
  ('APISONADO CON BAILARINA', 'M2', 80.0, 'Terracerías')
) AS t(name, unit, rend, category)
WHERE NOT EXISTS (SELECT 1 FROM activity_templates LIMIT 1);
