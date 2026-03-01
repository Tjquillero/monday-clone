-- Create table for Resource Efficiency Analysis persistence
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

-- Enable RLS
ALTER TABLE resource_analysis ENABLE ROW LEVEL SECURITY;

-- Simple policy: authenticated users can do everything for now
CREATE POLICY "Allow all for authenticated users" ON resource_analysis
    FOR ALL USING (auth.role() = 'authenticated');
