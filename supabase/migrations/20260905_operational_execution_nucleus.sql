-- Migration: 20260905_operational_execution_nucleus.sql
-- Description: Operational Execution Records & Verification Lifecycle (ADR-0009)
-- Isolation: Strictly operational domain. Zero mutations on POA/Billing/planned_jr.

-- 1. Operational Execution Records Table (weekly_plan_item_executions)
CREATE TABLE IF NOT EXISTS weekly_plan_item_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_item_id UUID NOT NULL REFERENCES weekly_plan_items(id) ON DELETE RESTRICT,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id UUID NULL REFERENCES groups(id) ON DELETE CASCADE,
  
  -- Field Execution Dimensions
  execution_date DATE NOT NULL,
  executed_qty NUMERIC NOT NULL CHECK (executed_qty >= 0),
  worker_count INT NOT NULL DEFAULT 1 CHECK (worker_count > 0),
  hours_worked NUMERIC NOT NULL DEFAULT 8 CHECK (hours_worked > 0),
  jornales_used NUMERIC GENERATED ALWAYS AS (worker_count * hours_worked / 8.0) STORED,
  
  -- Audit Trail & Verification State
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  verified_by UUID NULL REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  
  -- Execution Verification Lifecycle State Machine
  verification_status TEXT NOT NULL DEFAULT 'reported' 
    CHECK (verification_status IN ('reported', 'evidence_pending', 'verified', 'confirmed', 'closed', 'rejected')),
    
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for Query Performance & Audit
CREATE INDEX IF NOT EXISTS idx_wpie_item_id ON weekly_plan_item_executions(weekly_plan_item_id);
CREATE INDEX IF NOT EXISTS idx_wpie_verification_status ON weekly_plan_item_executions(verification_status);
CREATE INDEX IF NOT EXISTS idx_wpie_execution_date ON weekly_plan_item_executions(execution_date);

-- 3. Enable RLS
ALTER TABLE weekly_plan_item_executions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Allow authenticated read weekly_plan_item_executions"
  ON weekly_plan_item_executions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert weekly_plan_item_executions"
  ON weekly_plan_item_executions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update weekly_plan_item_executions"
  ON weekly_plan_item_executions FOR UPDATE
  TO authenticated
  USING (true);
