-- ============================================================================
-- Semilla: 2026100101_operational_frequencies_seed.sql
-- Propósito: Cargar frecuencias operativas por sitio y actividad (D19)
-- Tablero: 3ea0326f-6ff7-409f-848a-1f296e6e3cc8
-- ============================================================================

DO $$
DECLARE
  v_board_id UUID := '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID;
  v_active_version_id UUID;
BEGIN
  -- 1. Obtener versión activa de POA para el tablero
  SELECT pv.id INTO v_active_version_id
  FROM public.poa p
  JOIN public.poa_versions pv ON pv.poa_id = p.id AND pv.status = 'active'
  WHERE p.board_id = v_board_id
  LIMIT 1;

  IF v_active_version_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró versión de POA activa para el tablero %', v_board_id;
  END IF;

  -- 2. Calcular e insertar frecuencias operativas sobre poa_activity_zones (cantidad_contratada > 0)
  WITH raw_calc AS (
    SELECT 
      p.board_id,
      paz.zone_id AS group_id,
      pa.activity_key,
      g.title AS group_title,
      CASE
        -- CRONOGRAMA
        WHEN pa.activity_key = '1.01' THEN 25::NUMERIC
        WHEN pa.activity_key = '1.04' THEN 25::NUMERIC
        WHEN pa.activity_key = '1.09' THEN 4::NUMERIC
        WHEN pa.activity_key = '1.10' THEN 4::NUMERIC
        WHEN pa.activity_key = '1.11' THEN 4::NUMERIC
        WHEN pa.activity_key = '1.14' THEN 
          CASE WHEN g.title ILIKE '%PLAZA%' OR g.title ILIKE '%PUERTO COLOMBIA%' THEN 4::NUMERIC ELSE 1::NUMERIC END
        WHEN pa.activity_key = '1.15' THEN 
          CASE WHEN g.title ILIKE '%COUNTRY%' THEN 6::NUMERIC ELSE 8::NUMERIC END
        WHEN pa.activity_key = '2.01' THEN 4::NUMERIC
        WHEN pa.activity_key = '2.03' THEN 2::NUMERIC
        WHEN pa.activity_key = '2.06' THEN 0.5::NUMERIC
        WHEN pa.activity_key = '2.07' THEN 0.5::NUMERIC
        WHEN pa.activity_key = '2.08' THEN 0.5::NUMERIC
        WHEN pa.activity_key = '2.09' THEN 0.33::NUMERIC
        WHEN pa.activity_key = '2.10' THEN 0.33::NUMERIC
        WHEN pa.activity_key = '2.11' THEN 0.33::NUMERIC
        WHEN pa.activity_key = '2.12' THEN 2::NUMERIC
        WHEN pa.activity_key = '2.13' THEN 1::NUMERIC
        WHEN pa.activity_key = '2.14' THEN 0.33::NUMERIC
        WHEN pa.activity_key = '2.16' THEN 12::NUMERIC
        WHEN pa.activity_key = '2.18' THEN 
          CASE WHEN g.title ILIKE '%GASTRON%' THEN 25::NUMERIC ELSE 12::NUMERIC END
        WHEN pa.activity_key = '3.03' THEN 25::NUMERIC
        WHEN pa.activity_key = '3.04' THEN 1::NUMERIC
        WHEN pa.activity_key = '3.06' AND (g.title ILIKE '%GASTRON%' OR g.title ILIKE '%PLAZA%' OR g.title ILIKE '%PUERTO COLOMBIA%') THEN 25::NUMERIC

        -- POA
        WHEN pa.activity_key IN ('1.05', '1.06', '1.07', '1.08') THEN 1::NUMERIC
        WHEN pa.activity_key = '1.12' THEN
          CASE
            WHEN g.title ILIKE '%COUNTRY%' OR g.title ILIKE '%SABANILLA%' OR g.title ILIKE '%MIRAMAR%' THEN 6::NUMERIC
            WHEN g.title ILIKE '%PLAZA%' OR g.title ILIKE '%PUERTO COLOMBIA%' OR g.title ILIKE '%MANGLARES%' OR g.title ILIKE '%SALINAS%' THEN 4::NUMERIC
            ELSE NULL
          END
        WHEN pa.activity_key = '1.13' THEN
          CASE
            WHEN g.title ILIKE '%COUNTRY%' OR g.title ILIKE '%SABANILLA%' OR g.title ILIKE '%MIRAMAR%' OR g.title ILIKE '%SALINAS%' THEN 4::NUMERIC
            WHEN g.title ILIKE '%PLAZA%' OR g.title ILIKE '%PUERTO COLOMBIA%' OR g.title ILIKE '%MANGLARES%' THEN 2::NUMERIC
            ELSE NULL
          END
        WHEN pa.activity_key IN ('2.02', '2.15', '2.17', '2.19', '2.2', '2.20', '3.01', '3.02', '3.05', '3.07', '3.08', '3.09', '3.11', '3.12', '3.13') THEN 1::NUMERIC
        WHEN (pa.activity_key = '3.1' OR pa.activity_key = '3.10') THEN
          CASE
            WHEN g.title ILIKE '%PLAZA%' OR g.title ILIKE '%PUERTO COLOMBIA%' THEN 0.5::NUMERIC
            WHEN g.title ILIKE '%COUNTRY%' OR g.title ILIKE '%SABANILLA%' OR g.title ILIKE '%GASTRON%' THEN 1::NUMERIC
            ELSE NULL -- SALINAS y MERCADO sin fila
          END
        WHEN pa.activity_key IN ('2.04', '2.05', '2.21') THEN 0.5::NUMERIC
        WHEN pa.activity_key = '2.22' THEN 0.33::NUMERIC

        ELSE NULL -- 1.03, 3.14 y otras quedan sin fila
      END AS visits_per_month,
      CASE
        WHEN pa.activity_key IN (
          '1.01', '1.04', '1.09', '1.10', '1.11', '1.14', '1.15',
          '2.01', '2.03', '2.06', '2.07', '2.08', '2.09', '2.10', '2.11',
          '2.12', '2.13', '2.14', '2.16', '2.18', '3.03', '3.04', '3.06'
        ) THEN 'CRONOGRAMA'
        ELSE 'POA'
      END AS source
    FROM public.poa_activity_zones paz
    JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
    JOIN public.poa_versions pv ON pv.id = pa.poa_version_id AND pv.status = 'active'
    JOIN public.poa p ON p.id = pv.poa_id AND p.board_id = v_board_id
    JOIN public.groups g ON g.id = paz.zone_id
    WHERE paz.cantidad_contratada > 0
      AND g.title NOT ILIKE '%ASTILLERO%'
  )
  INSERT INTO public.operational_frequencies (board_id, group_id, activity_key, visits_per_month, source)
  SELECT 
    board_id,
    group_id,
    activity_key,
    visits_per_month,
    source
  FROM raw_calc
  WHERE visits_per_month IS NOT NULL AND visits_per_month > 0
  ON CONFLICT (board_id, group_id, activity_key)
  DO UPDATE SET 
    visits_per_month = EXCLUDED.visits_per_month,
    source = EXCLUDED.source;

  RAISE NOTICE 'Carga de operational_frequencies completada exitosamente';
END $$;

-- 3. Consulta de control: filas por sitio y por source
SELECT 
  g.title AS sitio,
  opf.source,
  COUNT(*) AS total_actividades,
  ROUND(AVG(opf.visits_per_month), 2) AS promedio_visitas_mes
FROM public.operational_frequencies opf
JOIN public.groups g ON g.id = opf.group_id
WHERE opf.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID
GROUP BY g.title, opf.source
ORDER BY g.title, opf.source;
