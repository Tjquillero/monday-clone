-- board_views: saved filter/sort/column-visibility configurations per board
-- Each board can have multiple named views; one can be marked as default.

CREATE TABLE IF NOT EXISTS board_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  filters         JSONB NOT NULL DEFAULT '[]',
  sorts           JSONB NOT NULL DEFAULT '[]',
  visible_columns JSONB NOT NULL DEFAULT '[]',
  settings        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one default view per board
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_views_default
  ON board_views (board_id)
  WHERE is_default = TRUE;

-- RLS: same pattern as all other tables — role check via get_user_board_role
ALTER TABLE board_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_views_select ON board_views
  FOR SELECT USING (
    get_user_board_role(board_id, auth.uid()) IS NOT NULL
  );

CREATE POLICY board_views_insert ON board_views
  FOR INSERT WITH CHECK (
    get_user_board_role(board_id, auth.uid()) IN ('admin', 'member')
  );

CREATE POLICY board_views_update ON board_views
  FOR UPDATE USING (
    get_user_board_role(board_id, auth.uid()) IN ('admin', 'member')
  );

CREATE POLICY board_views_delete ON board_views
  FOR DELETE USING (
    get_user_board_role(board_id, auth.uid()) = 'admin'
  );
