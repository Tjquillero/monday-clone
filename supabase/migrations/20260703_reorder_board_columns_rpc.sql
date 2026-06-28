-- RPC: reorder_board_columns
--
-- Updates column positions in a single transaction.
-- Called by useColumnMutations.reorderColumns() after a column drag.
--
-- Parameters:
--   p_board_id   — board whose columns to reorder (used for RLS check)
--   p_ordered_ids — column UUIDs in the desired order (left-to-right)
--
-- Positions are assigned as 0, 10, 20, … so there is room to insert
-- without a full reorder later.
--
-- RLS: the caller must have at least 'member' role on the board.
-- The SECURITY INVOKER default means the function runs as the calling
-- user, so row-level policies on board_columns still apply.

CREATE OR REPLACE FUNCTION reorder_board_columns(
  p_board_id   UUID,
  p_ordered_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check caller has at least member access (mirrors board_columns RLS)
  v_role := get_user_board_role(p_board_id, auth.uid());
  IF v_role IS NULL OR v_role = 'viewer' THEN
    RAISE EXCEPTION 'Insufficient permissions to reorder columns';
  END IF;

  -- Bulk update inside the implicit transaction of the function call.
  -- unnest() with ordinality gives (id, 1-based position index).
  UPDATE board_columns AS bc
  SET
    position   = (ord.rn - 1) * 10,
    updated_at = NOW()
  FROM (
    SELECT id, ROW_NUMBER() OVER () AS rn
    FROM unnest(p_ordered_ids) AS id
  ) AS ord
  WHERE bc.id    = ord.id
    AND bc.board_id = p_board_id;
END;
$$;
