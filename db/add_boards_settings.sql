-- Add settings column to boards table to persist global dashboard configuration
ALTER TABLE boards ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Comment describing the usage
COMMENT ON COLUMN boards.settings IS 'Stores dashboard configurations like total_acta, valor_acta_per_site, and view preferences.';
