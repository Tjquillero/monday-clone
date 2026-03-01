-- 1. Create attachments table
CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS on attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for attachments
DROP POLICY IF EXISTS "Members can see attachments" ON attachments;
CREATE POLICY "Members can see attachments" ON attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM items i
      JOIN groups g ON g.id = i.group_id
      WHERE i.id = attachments.item_id
      AND get_user_board_role(g.board_id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Members can upload attachments" ON attachments;
CREATE POLICY "Members can upload attachments" ON attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM items i
      JOIN groups g ON g.id = i.group_id
      WHERE i.id = attachments.item_id
      AND get_user_board_role(g.board_id, auth.uid()) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Members can delete attachments" ON attachments;
CREATE POLICY "Members can delete attachments" ON attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM items i
      JOIN groups g ON g.id = i.group_id
      WHERE i.id = attachments.item_id
      AND get_user_board_role(g.board_id, auth.uid()) IS NOT NULL
    )
  );

-- 4. Storage Setup (Bucket and Policies)
-- Note: This requires the storage extension to be enabled (it usually is)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'attachments' bucket
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Users can view their own attachments" ON storage.objects;
CREATE POLICY "Users can view their own attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
CREATE POLICY "Users can delete their own attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments');

-- 5. Add index for performance
CREATE INDEX IF NOT EXISTS idx_attachments_item_id ON attachments(item_id);
