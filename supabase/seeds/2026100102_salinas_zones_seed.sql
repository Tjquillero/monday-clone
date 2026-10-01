-- ============================================================================
-- Semilla: 2026100102_salinas_zones_seed.sql
-- Propósito: Cargar filas de poa_activity_zones para SALINAS DEL REY en la versión activa
-- Fuente: POA 2026 V.02 Ene.26-2026.xlsx (hoja POA INICIAL 2026, col 188)
-- ============================================================================

DO $$
DECLARE
  v_board_id UUID := '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID;
  v_group_id UUID;
  v_active_version_id UUID;
BEGIN
  -- 1. Obtener group_id de SALINAS DEL REY
  SELECT id INTO v_group_id 
  FROM public.groups 
  WHERE board_id = v_board_id 
    AND (title ILIKE '%SALINAS%DEL%REY%' OR title ILIKE '%SALINAS%')
  ORDER BY title ASC
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Sitio SALINAS DEL REY no encontrado en el tablero %', v_board_id;
  END IF;

  -- 2. Obtener versión activa de POA para el tablero
  SELECT pv.id INTO v_active_version_id
  FROM public.poa p
  JOIN public.poa_versions pv ON pv.poa_id = p.id AND pv.status = 'active'
  WHERE p.board_id = v_board_id
  LIMIT 1;

  IF v_active_version_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró versión de POA activa para el tablero %', v_board_id;
  END IF;

  -- 3. Insertar las 26 filas con cantidad contratada del Excel
  WITH raw_salinas(activity_key, cantidad) AS (
    VALUES
      ('1.01', 23412::NUMERIC),
      ('1.04', 10::NUMERIC),
      ('1.09', 300::NUMERIC),
      ('1.10', 23412::NUMERIC),
      ('1.11', 11706::NUMERIC),
      ('1.12', 15::NUMERIC),
      ('1.13', 15::NUMERIC),
      ('1.14', 23412::NUMERIC),
      ('1.15', 23412::NUMERIC),
      ('2.01', 840.49::NUMERIC),
      ('2.02', 55::NUMERIC),
      ('2.04', 55::NUMERIC),
      ('2.06', 840.49::NUMERIC),
      ('2.07', 55::NUMERIC),
      ('2.09', 840.49::NUMERIC),
      ('2.10', 55::NUMERIC),
      ('2.12', 840.49::NUMERIC),
      ('2.13', 55::NUMERIC),
      ('2.15', 55::NUMERIC),
      ('2.16', 895.49::NUMERIC),
      ('2.18', 895.49::NUMERIC),
      ('3.02', 7674.74::NUMERIC),
      ('3.03', 8568.05::NUMERIC),
      ('3.04', 2983.1::NUMERIC),
      ('3.07', 7::NUMERIC),
      ('3.1',  5::NUMERIC)
  )
  INSERT INTO public.poa_activity_zones (poa_activity_id, zone_id, cantidad_contratada)
  SELECT 
    pa.id,
    v_group_id,
    rs.cantidad
  FROM raw_salinas rs
  JOIN public.poa_activities pa ON pa.activity_key = rs.activity_key AND pa.poa_version_id = v_active_version_id
  ON CONFLICT (poa_activity_id, zone_id) 
  DO UPDATE SET cantidad_contratada = EXCLUDED.cantidad_contratada;

  RAISE NOTICE 'Carga de poa_activity_zones para SALINAS DEL REY completada exitosamente';
END $$;

-- Control y verificación de filas cargadas
SELECT 
  g.title AS sitio,
  pa.activity_key,
  paz.cantidad_contratada,
  paz.created_at
FROM public.poa_activity_zones paz
JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
JOIN public.groups g ON g.id = paz.zone_id
WHERE g.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID
  AND (g.title ILIKE '%SALINAS%DEL%REY%' OR g.title ILIKE '%SALINAS%')
ORDER BY pa.activity_key;
