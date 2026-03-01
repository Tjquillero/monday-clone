-- Add unit_price column to activity_templates
ALTER TABLE activity_templates 
ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
