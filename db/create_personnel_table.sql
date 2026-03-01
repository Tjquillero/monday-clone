-- Create personnel table
CREATE TABLE IF NOT EXISTS personnel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  role TEXT,
  default_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Enable all access for authenticated users" ON personnel
  FOR ALL USING (auth.role() = 'authenticated');

-- Add personnel_id to items (for assignment)
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS personnel_id UUID REFERENCES personnel(id);
