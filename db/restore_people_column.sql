-- Restore People Column if missing
INSERT INTO columns (board_id, id, title, type, width, position)
VALUES 
  ('board-1', 'people', 'Personas', 'people', 150, 2)
ON CONFLICT (board_id, id) DO UPDATE 
SET title = 'Personas', type = 'people', width = 150;
