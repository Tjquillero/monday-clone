-- =================================================================
-- MANTENIX SECURITY - SECURE FINANCIAL TABLES RLS
-- =================================================================
-- This script applies Row Level Security to the financial tables
-- (`financial_actas` and `financial_acta_details`) to ensure
-- only board members can access their respective financial data.
-- =================================================================

-- Step 1: Enable RLS on the financial tables.
-- This is idempotent and safe to run multiple times.
ALTER TABLE public.financial_actas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_acta_details ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any old, insecure, or conflicting policies.
DROP POLICY IF EXISTS "Allow authenticated access" ON public.financial_actas;
DROP POLICY IF EXISTS "Allow authenticated access" ON public.financial_acta_details;
DROP POLICY IF EXISTS "Allow all for board members" ON public.financial_actas;
DROP POLICY IF EXISTS "Allow all for board members" ON public.financial_acta_details;


-- Step 3: Create new policies based on board membership.

-- Policies for `financial_actas` table
-- Users can perform any action on actas of boards they are a member of.
CREATE POLICY "Allow all for board members" ON public.financial_actas
  FOR ALL
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL)
  WITH CHECK (get_user_board_role(board_id, auth.uid()) IS NOT NULL);


-- Policies for `financial_acta_details` table
-- Users can perform any action on acta details if they are a member of the parent board.
CREATE POLICY "Allow all for board members" ON public.financial_acta_details
  FOR ALL
  USING (
    (get_user_board_role((SELECT board_id FROM public.financial_actas WHERE id = acta_id), auth.uid())) IS NOT NULL
  )
  WITH CHECK (
    (get_user_board_role((SELECT board_id FROM public.financial_actas WHERE id = acta_id), auth.uid())) IS NOT NULL
  );

-- =================================================================
-- END OF SCRIPT
-- =================================================================
