-- =============================================
-- MANTENIX SECURITY AUDIT - CORE TABLES RLS
-- =============================================
-- This script standardizes Row Level Security (RLS) for core tables.
-- It ensures that ONLY authenticated users can access data.
-- It is IDEMPOTENT: Safe to run multiple times.

-- Helper function to enable RLS and policy
-- FIX: Renamed parameter to 'target_table' to avoid ambiguity with column 'table_name'
CREATE OR REPLACE FUNCTION enable_rls_authenticated(target_table TEXT) RETURNS void AS $$
BEGIN
    -- Check if table exists before proceeding
    -- FIX: Using 'target_table' parameter for comparison
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = target_table AND table_schema = 'public') THEN
        -- 1. Enable RLS
        EXECUTE 'ALTER TABLE ' || target_table || ' ENABLE ROW LEVEL SECURITY';

        -- 2. Drop existing policies (to ensure clean slate or update)
        EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated access" ON ' || target_table;
        
        -- 3. Create new standard policy
        EXECUTE 'CREATE POLICY "Allow authenticated access" ON ' || target_table || ' FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply to Core Tables (Corrected Table Names)
SELECT enable_rls_authenticated('boards');
SELECT enable_rls_authenticated('groups');
SELECT enable_rls_authenticated('board_columns'); -- Corrected from 'columns'
SELECT enable_rls_authenticated('items');

-- Apply to Auxiliary Tables if they exist
SELECT enable_rls_authenticated('activity_log');
SELECT enable_rls_authenticated('notifications');
SELECT enable_rls_authenticated('task_dependencies');
SELECT enable_rls_authenticated('personnel');
SELECT enable_rls_authenticated('resource_analysis');
SELECT enable_rls_authenticated('comments'); 

-- 4. Verify (Optional Select to confirm)
-- SELECT * FROM pg_policies WHERE policyname = 'Allow authenticated access';
