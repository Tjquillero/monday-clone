-- =================================================================
-- MANTENIX SECURITY V2 - SECURE ROLE-BASED RLS
-- =================================================================
-- This script implements a robust, multi-tenant security model based on
-- board membership and roles within those boards.
--
-- Key Concepts:
-- 1. A `board_members` table links users to boards with a specific role.
-- 2. Policies on all other tables check against this membership table.
-- 3. A trigger automatically makes the creator of a board its first admin.
-- =================================================================

-- Step 1: Create the Board Members table
-- This table is the cornerstone of our permission system.
CREATE TABLE IF NOT EXISTS public.board_members (
    board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- e.g., 'admin', 'member', 'viewer'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (board_id, user_id)
);

-- Optional: Add an index for faster user lookups
CREATE INDEX IF NOT EXISTS board_members_user_id_idx ON public.board_members(user_id);


-- Step 2: Create a helper function to check a user's role on a board.
-- This simplifies policy creation significantly.
CREATE OR REPLACE FUNCTION get_user_board_role(p_board_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT role
    FROM public.board_members
    WHERE board_id = p_board_id AND user_id = p_user_id
  );
END;
$$;


-- Step 3: Create a trigger to automatically make a board's creator an admin.
-- This ensures that every new board has an owner.
CREATE OR REPLACE FUNCTION public.handle_new_board()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert the creator of the board into board_members as an 'admin'
  INSERT INTO public.board_members (board_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'admin');
  RETURN NEW;
END;
$$;

-- Drop the trigger if it exists, then create it.
DROP TRIGGER IF EXISTS on_board_created ON public.boards;
CREATE TRIGGER on_board_created
  AFTER INSERT ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_board();


-- Step 4: Enable RLS on all relevant tables.
-- This is idempotent and safe to run multiple times.
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;


-- Step 5: Drop all old, insecure policies.
DROP POLICY IF EXISTS "Allow authenticated access" ON public.boards;
DROP POLICY IF EXISTS "Allow authenticated access" ON public.groups;
DROP POLICY IF EXISTS "Allow authenticated access" ON public.items;
DROP POLICY IF EXISTS "Allow authenticated access" ON public.board_columns;
DROP POLICY IF EXISTS "Allow authenticated access" ON public.comments;
DROP POLICY IF EXISTS "Allow authenticated access" ON public.task_dependencies;
-- We will create a new policy for board_members below.
DROP POLICY IF EXISTS "Allow authenticated access" ON public.board_members;


-- Step 6: Create new, secure policies for each table.

-- Policies for `boards` table
CREATE POLICY "Users can see boards they are members of" ON public.boards
  FOR SELECT USING (get_user_board_role(id, auth.uid()) IS NOT NULL);

CREATE POLICY "Users can create boards" ON public.boards
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Board admins can update their boards" ON public.boards
  FOR UPDATE USING (get_user_board_role(id, auth.uid()) = 'admin');

CREATE POLICY "Board admins can delete their boards" ON public.boards
  FOR DELETE USING (get_user_board_role(id, auth.uid()) = 'admin');


-- Policies for `board_members` table
CREATE POLICY "Users can see members of boards they belong to" ON public.board_members
  FOR SELECT USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

CREATE POLICY "Board admins can add new members" ON public.board_members
  FOR INSERT WITH CHECK (get_user_board_role(board_id, auth.uid()) = 'admin');

CREATE POLICY "Board admins can update member roles" ON public.board_members
  FOR UPDATE USING (get_user_board_role(board_id, auth.uid()) = 'admin');

-- Allow users to remove themselves, and admins to remove anyone (except the last admin).
CREATE POLICY "Users can be removed from boards" ON public.board_members
  FOR DELETE USING (
    -- An admin can remove anyone
    get_user_board_role(board_id, auth.uid()) = 'admin'
    -- A user can remove themselves, as long as they are not the last admin
    OR (user_id = auth.uid() AND (
        SELECT COUNT(*) 
        FROM public.board_members bm 
        WHERE bm.board_id = board_members.board_id AND bm.role = 'admin'
    ) > 1)
  );


-- Policies for `groups`, `items`, `board_columns`, etc.
-- The pattern is the same: check for membership on the parent board.

-- For `groups`
CREATE POLICY "Board members can manage groups" ON public.groups
  FOR ALL USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

-- For `items`
CREATE POLICY "Board members can manage items" ON public.items
  FOR ALL USING (
    (get_user_board_role((SELECT board_id FROM public.groups WHERE id = group_id), auth.uid())) IS NOT NULL
  );

-- For `board_columns`
CREATE POLICY "Board members can manage columns" ON public.board_columns
  FOR ALL USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

-- For `comments`
CREATE POLICY "Board members can manage comments" ON public.comments
  FOR ALL USING (
    (get_user_board_role((SELECT g.board_id FROM public.items i JOIN public.groups g ON i.group_id = g.id WHERE i.id = item_id), auth.uid())) IS NOT NULL
  );

-- For `task_dependencies`
CREATE POLICY "Board members can manage dependencies" ON public.task_dependencies
  FOR ALL USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

-- =================================================================
-- END OF SCRIPT
-- =================================================================
--
-- IMPORTANT NEXT STEPS:
-- 1. Run this script in your Supabase SQL editor.
-- 2. You MUST manually add existing users to the `board_members` table
--    for any existing boards they should have access to. For example:
--    INSERT INTO public.board_members (board_id, user_id, role)
--    VALUES ('your-existing-board-id', 'your-user-id', 'admin');
--
-- =================================================================
