-- SQL Fix for 403 Forbidden Error on activity_templates (Row Level Security)
-- This script enables RLS on the activity_templates table and allows authenticated users to read and write.

-- 1. Enable Row Level Security
ALTER TABLE activity_templates ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated select on activity_templates" ON activity_templates;
DROP POLICY IF EXISTS "Allow authenticated insert on activity_templates" ON activity_templates;
DROP POLICY IF EXISTS "Allow authenticated update on activity_templates" ON activity_templates;
DROP POLICY IF EXISTS "Allow authenticated delete on activity_templates" ON activity_templates;

-- 3. Create policies for authenticated users
-- Allow selecting templates
CREATE POLICY "Allow authenticated select on activity_templates" 
ON activity_templates FOR SELECT 
TO authenticated 
USING (true);

-- Allow inserting new templates
CREATE POLICY "Allow authenticated insert on activity_templates" 
ON activity_templates FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow updating templates
CREATE POLICY "Allow authenticated update on activity_templates" 
ON activity_templates FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow deleting templates
CREATE POLICY "Allow authenticated delete on activity_templates" 
ON activity_templates FOR DELETE 
TO authenticated 
USING (true);

-- 4. Add to Realtime Publication (Optional)
ALTER PUBLICATION supabase_realtime ADD TABLE activity_templates;

-- 5. (Optional) If you want public (anon) access as well, uncomment the following:
-- CREATE POLICY "Allow anon select on activity_templates" 
-- ON activity_templates FOR SELECT 
-- TO anon 
-- USING (true);
