-- Create financial_actas table
CREATE TABLE IF NOT EXISTS financial_actas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start DATE,
    period_end DATE,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    observations TEXT
);

-- Create financial_acta_details table
CREATE TABLE IF NOT EXISTS financial_acta_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    acta_id UUID REFERENCES financial_actas(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL, -- References the budget item ID (might be string or int in JSON)
    group_id TEXT NOT NULL, -- References the Site/Group ID
    quantity NUMERIC DEFAULT 0,
    value NUMERIC DEFAULT 0,
    percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(acta_id, item_id, group_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_financial_actas_board_id ON financial_actas(board_id);
CREATE INDEX IF NOT EXISTS idx_financial_acta_details_acta_id ON financial_acta_details(acta_id);
CREATE INDEX IF NOT EXISTS idx_financial_acta_details_identifiers ON financial_acta_details(acta_id, item_id, group_id);
