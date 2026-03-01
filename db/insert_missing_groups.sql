DO $$
DECLARE
    v_board_id UUID;
    v_group_id UUID;
    v_rubro TEXT;
    v_title TEXT;
    v_rubros TEXT[] := ARRAY['Nómina', 'Insumos', 'Transporte', 'Fijo', 'Caja Menor'];
BEGIN
    -- 1. Obtener el primer board
    SELECT id INTO v_board_id FROM boards LIMIT 1;
    IF v_board_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró ningún board.';
    END IF;

    -- 2. Obtener el group "PRESUPUESTO GENERAL"
    SELECT id INTO v_group_id 
    FROM groups 
    WHERE board_id = v_board_id 
      AND title ILIKE '%PRESUPUESTO GENERAL%' 
    LIMIT 1;

    -- Si no existe, usamos el primer grupo que haya
    IF v_group_id IS NULL THEN
        SELECT id INTO v_group_id FROM groups WHERE board_id = v_board_id LIMIT 1;
    END IF;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró ningún grupo para insertar los ítems.';
    END IF;

    -- 3. Insertar los ítems
    FOREACH v_rubro IN ARRAY v_rubros
    LOOP
        v_title := v_rubro || ' - General';

        -- Verificar si ya existe para no duplicar
        IF NOT EXISTS (
            SELECT 1 FROM items WHERE name = v_title AND group_id = v_group_id
        ) THEN
            INSERT INTO items (
                group_id,
                name,
                position,
                values
            ) VALUES (
                v_group_id,
                v_title,
                999,
                jsonb_build_object(
                    'rubro', v_rubro,
                    'category', 'General',
                    'sub_category', 'General',
                    'unit', 'Gl',
                    'cant', 1,
                    'unit_price', 0,
                    'item_type', 'financial',
                    'code', '0.0.0.0'
                )
            );
            RAISE NOTICE 'Insertado ítem: %', v_title;
        ELSE
            RAISE NOTICE 'El ítem % ya existe.', v_title;
        END IF;
    END LOOP;
END $$;
