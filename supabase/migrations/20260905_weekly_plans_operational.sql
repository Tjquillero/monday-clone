-- Migration: 20260905_weekly_plans_operational.sql
-- Description: Operational Weekly Planning Tables (ADR-0008)
-- Isolation: Operates strictly in operational planning domain. Zero mutations on POA/Billing/planned_jr.

-- 1. Operational Weekly Plan Header Table
CREATE TABLE IF NOT EXISTS weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id UUID NULL REFERENCES groups(id) ON DELETE CASCADE, -- Site/Zone ID
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Invariant: Unique operational plan per board, group/site, and week start
  CONSTRAINT uq_weekly_plan_board_group_week UNIQUE (board_id, group_id, week_start_date)
);

-- 2. Operational Weekly Plan Item Table
CREATE TABLE IF NOT EXISTS weekly_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id UUID NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id UUID NULL REFERENCES groups(id) ON DELETE CASCADE,
  
  -- Activity Semantic Identity
  activity_key TEXT NOT NULL,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  unit TEXT NOT NULL,
  
  -- Operational Dimensions
  planned_date DATE NOT NULL,
  planned_qty NUMERIC NOT NULL CHECK (planned_qty >= 0),
  theoretical_jr NUMERIC NOT NULL CHECK (theoretical_jr >= 0),
  
  -- Origin & Traceability
  source_type TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (source_type IN ('ROUTINE', 'INCIDENT', 'MANUAL')),
  routine_reference TEXT NOT NULL DEFAULT 'manual', -- Template ID or routine reference
  occurrence_key TEXT NOT NULL,                    -- Deterministic Occurrence Key (DB-level uniqueness)
  
  -- Operational Crew & Human Override
  crew_id UUID NULL,                               -- Decoupled crew assignment
  is_manual_override BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT NULL,
  
  -- Lifecycle Status
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- DB-level uniqueness constraint to prevent race conditions and duplicate occurrences
  CONSTRAINT uq_weekly_plan_item_occurrence UNIQUE (weekly_plan_id, occurrence_key)
);

-- 3. Operational Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_plans_board_week ON weekly_plans(board_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_plan_id ON weekly_plan_items(weekly_plan_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_board_date ON weekly_plan_items(board_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_status ON weekly_plan_items(status);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_occurrence ON weekly_plan_items(occurrence_key);

-- 4. Enable RLS
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plan_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Allow authenticated read weekly_plans"
  ON weekly_plans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert weekly_plans"
  ON weekly_plans FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update weekly_plans"
  ON weekly_plans FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read weekly_plan_items"
  ON weekly_plan_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert weekly_plan_items"
  ON weekly_plan_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update weekly_plan_items"
  ON weekly_plan_items FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete weekly_plan_items"
  ON weekly_plan_items FOR DELETE
  TO authenticated
  USING (true);
