-- Composite index on (board_id, position) for board_columns.
--
-- The query in useBoardData is:
--   SELECT * FROM board_columns WHERE board_id = $1 ORDER BY position
--
-- With only idx_board_columns_board_id (single-column), Postgres uses the
-- index for the WHERE clause but then performs a filesort for ORDER BY.
-- A composite index on (board_id, position) lets Postgres scan in order
-- without a separate sort step — especially useful during column reorder
-- when positions are updated and immediately re-queried.

CREATE INDEX IF NOT EXISTS idx_board_columns_board_id_position
  ON board_columns (board_id, position);
