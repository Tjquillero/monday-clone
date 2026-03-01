-- Create notifications table for live alerts
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

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'notifications' 
        AND policyname = 'Users can view own notifications'
    ) THEN
        CREATE POLICY "Users can view own notifications" ON notifications
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'notifications' 
        AND policyname = 'Users can update own notifications'
    ) THEN
        CREATE POLICY "Users can update own notifications" ON notifications
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Enable Realtime for notifications
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
