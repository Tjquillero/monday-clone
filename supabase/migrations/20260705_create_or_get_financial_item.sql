-- Migración SQL: Limpiar duplicados de ítems financieros preexistentes, crear el índice único parcial y la función get_or_create_financial_item.

-- 1. Eliminar duplicados físicos existentes en la base de datos para permitir la creación del índice único
DELETE FROM public.items a
USING public.items b
WHERE a.id > b.id
  AND a.group_id = b.group_id
  AND a.name = b.name
  AND (a.values->>'item_type' = 'financial')
  AND (b.values->>'item_type' = 'financial');

-- 2. Crear el índice único parcial
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_group_id_name_financial
ON public.items (group_id, name)
WHERE (values->>'item_type' = 'financial');

-- 3. Crear la RPC get_or_create_financial_item
CREATE OR REPLACE FUNCTION public.get_or_create_financial_item(
  p_group_id UUID,
  p_name TEXT,
  p_values JSONB
) RETURNS public.items AS $$
DECLARE
  v_item public.items;
BEGIN
  -- Validar estrictamente el tipo de ítem financiero para asegurar que active el índice único parcial
  IF p_values IS NULL OR p_values->>'item_type' IS DISTINCT FROM 'financial' THEN
    RAISE EXCEPTION 'Tipo de ítem inválido. Se esperaba {"item_type": "financial"}, se recibió: %', p_values;
  END IF;

  -- Intentar insertar e interceptar conflicto usando la cláusula ON CONFLICT que hace match exacto con el índice parcial
  INSERT INTO public.items (group_id, name, values, position)
  VALUES (p_group_id, p_name, p_values, 999)
  ON CONFLICT (group_id, name) WHERE (values->>'item_type' = 'financial')
  DO UPDATE SET name = EXCLUDED.name -- Dummy update to trigger RETURNING
  RETURNING * INTO v_item;

  RETURN v_item;
EXCEPTION 
  WHEN unique_violation THEN
    -- Fallback de seguridad en caso de concurrencia extrema o violación indirecta
    SELECT * INTO v_item
    FROM public.items
    WHERE group_id = p_group_id
      AND name = p_name
      AND (values->>'item_type' = 'financial');

    RETURN v_item;
  WHEN OTHERS THEN
    -- Dejamos que los demás errores de base de datos se propaguen limpiamente
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
