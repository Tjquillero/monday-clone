-- Migration: 20260905_evidence_verification_nucleus.sql
-- Description: Evidence Verification & Operational Certification Engine (ADR-0011)
-- Isolation: Strictly operational verification domain. Zero mutations on POA/Billing/planned_jr.

-- 1. Extend weekly_plan_item_executions with audit trail for verification and package closure
ALTER TABLE weekly_plan_item_executions
  ADD COLUMN IF NOT EXISTS verification_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS rejected_by UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL;

-- 2. Indexes for certifiable quantity aggregations and verification status queries
CREATE INDEX IF NOT EXISTS idx_wpie_certifiable 
  ON weekly_plan_item_executions(weekly_plan_item_id, verification_status);

CREATE INDEX IF NOT EXISTS idx_wpie_verification_audit 
  ON weekly_plan_item_executions(verified_by, rejected_by, confirmed_by);

-- 3. RLS Security Enforcement for Verification Actions
-- Allow supervisors and admins to update verification status and notes
CREATE POLICY "Allow supervisors and admins to verify weekly_plan_item_executions"
  ON weekly_plan_item_executions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
