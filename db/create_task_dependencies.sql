-- Create task dependencies table for Gantt charts
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    source_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE, -- Predecessor (The blocker)
    target_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE, -- Successor (The blocked)
    type TEXT DEFAULT 'finish_to_start', -- 'finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'
    lag INTEGER DEFAULT 0, -- Days of lag/lead
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent circular dependencies or duplicate links at DB level
    UNIQUE(source_item_id, target_item_id),
    CHECK (source_item_id != target_item_id)
);

-- Enable RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can do everything (for now)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'task_dependencies' 
        AND policyname = 'Allow all for authenticated users'
    ) THEN
        CREATE POLICY "Allow all for authenticated users" ON task_dependencies
            FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- Enable Realtime for dependencies so Gantt updates live
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'task_dependencies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_dependencies;
  END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_deps_source ON task_dependencies(source_item_id);
CREATE INDEX IF NOT EXISTS idx_deps_target ON task_dependencies(target_item_id);
CREATE INDEX IF NOT EXISTS idx_deps_board ON task_dependencies(board_id);
