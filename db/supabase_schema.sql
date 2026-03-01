-- Esquema de Base de Datos para Mantenix (Clon de Monday.com)

-- 1. Tablas de Espacios de Trabajo y Tableros
CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  favorite BOOLEAN DEFAULT FALSE,
  owner_id UUID REFERENCES auth.users(id)
);

-- 2. Definición de Columnas (Metadatos del tablero)
CREATE TABLE board_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- 'status', 'people', 'date', 'priority', 'text', 'number'
  width INTEGER DEFAULT 150,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Grupos dentro de los tableros
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT DEFAULT '#c4c4c4',
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Elementos (Tareas) y Sub-elementos
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES items(id) ON DELETE CASCADE, -- NULL para tareas principales
  name TEXT NOT NULL,
  description TEXT,
  values JSONB DEFAULT '{}'::jsonb, -- Almacena dinámicamente los valores de las columnas
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Registro de Actividad (Log)
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- 'status_change', 'name_update', etc.
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar Real-time para sincronización en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE boards, groups, items, board_columns;

-- Índices para optimizar búsquedas
CREATE INDEX idx_items_group_id ON items(group_id);
CREATE INDEX idx_items_parent_id ON items(parent_id);
CREATE INDEX idx_board_columns_board_id ON board_columns(board_id);
CREATE INDEX idx_groups_board_id ON groups(board_id);
