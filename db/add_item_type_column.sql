
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'activity';

-- Start by setting all existing items to 'activity' to be safe (or leave as null and treat null as activity)
-- Let's update any item with a 'rubro' or 'category' that implies finance to 'financial' if possible?
-- No, better to default to 'activity' for safety, and user can manually clean up or we can batch update based on logic.
-- Actually, the user has "Nuevo Item" created recently which are the problem.
-- I will run a query to delete those "Nuevo Item" that have empty names or specific pattern if requested, but for now just adding the column.

UPDATE items SET item_type = 'activity' WHERE item_type IS NULL;
