-- =============================================
-- MANTENIX ELITE FEATURES - CONSOLIDATED SCRIPT
-- =============================================
-- This script safely creates tables for Notifications and Task Dependencies.
-- It is idempotent: You can run it multiple times without errors.

-- 1. NOTIFICATIONS TABLE (Real-time Alerts)
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info', -- 'info', 'alert', 'success', 'mention'
    read BOOLEAN DEFAULT FALSE,
    link TEXT, -- Optional link to a specific board or item
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Safely create policies for notifications
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can view own notifications') THEN
        CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update own notifications') THEN
        CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;


-- 2. TASK DEPENDENCIES TABLE (Gantt Links)
-- =============================================
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

-- Enable RLS for dependencies
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

-- Safely create policies for dependencies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_dependencies' AND policyname = 'Allow all for authenticated users') THEN
        CREATE POLICY "Allow all for authenticated users" ON task_dependencies FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deps_source ON task_dependencies(source_item_id);
CREATE INDEX IF NOT EXISTS idx_deps_target ON task_dependencies(target_item_id);
CREATE INDEX IF NOT EXISTS idx_deps_board ON task_dependencies(board_id);


-- 3. ENABLE REALTIME (For both tables)
-- =============================================
DO $$ 
BEGIN
  -- Notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  -- Task Dependencies
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_dependencies') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_dependencies;
  END IF;
END $$;

-- Done!
