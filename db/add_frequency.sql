-- Add frequency column to activity_templates
ALTER TABLE activity_templates 
ADD COLUMN IF NOT EXISTS frequency NUMERIC DEFAULT 25; 
-- Default 25 means Factor 1 (Once a month)
