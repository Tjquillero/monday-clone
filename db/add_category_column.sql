-- Add Category Column
INSERT INTO columns (board_id, id, title, type, width, position)
VALUES 
  ('board-1', 'category', 'Categoría', 'text', 150, 5)
ON CONFLICT (board_id, id) DO UPDATE 
SET title = 'Categoría', type = 'text';
