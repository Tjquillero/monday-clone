-- 1. Create comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 3. Create Policy (Allow all authenticated users to read/write)
-- Ideally restrict to board members, but for now open to auth users
CREATE POLICY "Enable all access for authenticated users" ON comments
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
