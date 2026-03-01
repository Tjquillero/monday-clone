
-- Create default financial groups if they don't exist (Schema Safe Version)
DO $$
DECLARE
    target_group_id UUID;
    rubro_name TEXT;
    rubros TEXT[] := ARRAY['Nómina', 'Insumos', 'Transporte', 'Fijo', 'Caja Menor'];
BEGIN
    -- Get the ID of the first group to use as container
    SELECT id INTO target_group_id FROM groups LIMIT 1;
    
    IF target_group_id IS NOT NULL THEN
        FOREACH rubro_name IN ARRAY rubros
        LOOP
            -- Check if an item with this rubro already exists
            IF NOT EXISTS (
                SELECT 1 FROM items 
                WHERE (values->>'rubro')::text = rubro_name
                OR (values->>'major_category')::text = rubro_name
            ) THEN
                -- Insert placeholder item WITHOUT specifying 'item_type' column
                INSERT INTO items (group_id, name, values, position)
                VALUES (
                    target_group_id, 
                    rubro_name || ' - General', 
                    jsonb_build_object(
                        'rubro', rubro_name,
                        'category', 'General',
                        'unit', 'Gl',
                        'cant', 1,
                        'unit_price', 0,
                        'item_type', 'financial'
                    ),
                    999
                );
                RAISE NOTICE 'Created group: %', rubro_name;
            ELSE
                RAISE NOTICE 'Group already exists: %', rubro_name;
            END IF;
        END LOOP;
    ELSE
        RAISE NOTICE 'No groups found to attach items to.';
    END IF;
END $$;
