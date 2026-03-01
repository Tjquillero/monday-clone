-- 1. Automations Table
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- 'status_change', 'value_change', 'item_created'
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL, -- 'notify', 'set_value', 'move_group'
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RLS POLICIES
-- -----------------------------------------------------------------
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Board Admins, Owners and Creators can manage automations
DROP POLICY IF EXISTS "Admins can manage dashbaord automations" ON automations;
DROP POLICY IF EXISTS "Admins and Owners can manage dashboard automations" ON automations;
CREATE POLICY "Admins and Owners can manage dashboard automations" ON automations
  FOR ALL 
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = board_id AND bm.user_id = auth.uid() AND bm.role = 'admin')
  )
  WITH CHECK (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.owner_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = board_id AND bm.user_id = auth.uid() AND bm.role = 'admin')
  );

-- All board members and owners can see automations
DROP POLICY IF EXISTS "Members can see dashboard automations" ON automations;
DROP POLICY IF EXISTS "Members and Owners can see dashboard automations" ON automations;
CREATE POLICY "Members and Owners can see dashboard automations" ON automations
  FOR SELECT 
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = board_id AND bm.user_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.owner_id = auth.uid())
  );

-- 3. INDEXES
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_automations_board_id ON automations(board_id);
CREATE INDEX IF NOT EXISTS idx_automations_trigger ON automations(trigger_type);

-- 4. REALTIME
-- -----------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE automations;

-- 5. SEED INITIAL RECIPE: Mandatory Evidence
-- -----------------------------------------------------------------
-- This serves as a template until the UI is ready
-- "If status changes to Done and there are no attachments, reset status and notify"
-- Trigger Config: { "column_id": "status", "value": "Done" }
-- Action Config: { "reset_column": "status", "notify_message": "Evidence required" }
