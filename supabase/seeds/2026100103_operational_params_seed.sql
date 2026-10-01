-- ============================================================================
-- Semilla: 2026100103_operational_params_seed.sql
-- Propósito: Cargar parámetros operativos por sitio (D21–D26 / GATE FREQ-OP-02)
--            - qty_mode = 'SPLIT' (D21)
--            - Overrides de rendimiento por sitio y actividad (D23)
--            - Exclusión de PLAYA PUNTA ASTILLEROS (D25)
--            - Capacidad diaria por sitio (D24)
-- Tablero: 3ea0326f-6ff7-409f-848a-1f296e6e3cc8
-- ============================================================================

DO $$
DECLARE
  v_board_id UUID := '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID;

  v_gid_plaza UUID;
  v_gid_manglares UUID;
  v_gid_country UUID;
  v_gid_sabanilla UUID;
  v_gid_miramar UUID;
  v_gid_gastronomico UUID;
  v_gid_salinas UUID;
  v_gid_sazon UUID;
  v_gid_veronica UUID;
  v_gid_astilleros UUID;

  v_cnt INT;

BEGIN
  -- 1. Resolver IDs de cada sitio con validación unívoca e insensibilidad a tildes (translate)
  
  -- PLAZA PUERTO COLOMBIA
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_plaza
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%PLAZA%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio PLAZA no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- PLAYA MANGLARES
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_manglares
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%MANGLARES%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio MANGLARES no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- PLAYA DEL COUNTRY
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_country
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%COUNTRY%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio COUNTRY no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- PLAYA DE SABANILLA 2
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_sabanilla
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%SABANILLA%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio SABANILLA no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- PLAYAS DE MIRAMAR SECTOR EL FARO
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_miramar
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%MIRAMAR%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio MIRAMAR no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- CENTRO GASTRONÓMICO
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_gastronomico
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%GASTRONOMICO%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio GASTRONOMICO no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- SALINAS DEL REY
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_salinas
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%SALINAS%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio SALINAS no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- MERCADO LA SAZÓN
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_sazon
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%SAZON%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio SAZON no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- SENDERO SANTA VERÓNICA
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_veronica
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%VERONICA%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Sitio VERONICA no resuelto de forma unívoca (encontrados: %) en tablero %', v_cnt, v_board_id;
  END IF;

  -- a) Actualizar qty_mode = 'SPLIT' para actividades 1.09, 1.10 y 3.06 (D21)
  UPDATE public.operational_frequencies
  SET qty_mode = 'SPLIT'
  WHERE board_id = v_board_id
    AND activity_key IN ('1.09', '1.10', '3.06');

  -- b) Overrides de Rendimiento por Sitio (D23)
  -- 1.01
  UPDATE public.operational_frequencies SET rendimiento = 3000 WHERE board_id = v_board_id AND group_id = v_gid_plaza AND activity_key = '1.01';
  UPDATE public.operational_frequencies SET rendimiento = 4900 WHERE board_id = v_board_id AND group_id = v_gid_manglares AND activity_key = '1.01';
  UPDATE public.operational_frequencies SET rendimiento = 6950 WHERE board_id = v_board_id AND group_id = v_gid_country AND activity_key = '1.01';
  UPDATE public.operational_frequencies SET rendimiento = 8100 WHERE board_id = v_board_id AND group_id = v_gid_salinas AND activity_key = '1.01';
  UPDATE public.operational_frequencies SET rendimiento = 8200 WHERE board_id = v_board_id AND group_id = v_gid_sabanilla AND activity_key = '1.01';
  UPDATE public.operational_frequencies SET rendimiento = 8850 WHERE board_id = v_board_id AND group_id = v_gid_miramar AND activity_key = '1.01';

  -- 1.09: 30 en todos los sitios
  UPDATE public.operational_frequencies SET rendimiento = 30 WHERE board_id = v_board_id AND activity_key = '1.09';

  -- 2.03: 200; 2.16: 3500; 2.18: 7500 (todos los sitios que las tengan)
  UPDATE public.operational_frequencies SET rendimiento = 200  WHERE board_id = v_board_id AND activity_key = '2.03';
  UPDATE public.operational_frequencies SET rendimiento = 3500 WHERE board_id = v_board_id AND activity_key = '2.16';
  UPDATE public.operational_frequencies SET rendimiento = 7500 WHERE board_id = v_board_id AND activity_key = '2.18';

  -- 3.06: PLAZA PUERTO COLOMBIA 600, CENTRO GASTRONÓMICO 300
  UPDATE public.operational_frequencies SET rendimiento = 600 WHERE board_id = v_board_id AND group_id = v_gid_plaza AND activity_key = '3.06';
  UPDATE public.operational_frequencies SET rendimiento = 300 WHERE board_id = v_board_id AND group_id = v_gid_gastronomico AND activity_key = '3.06';

  -- 3.04: CENTRO GASTRONÓMICO 3000; PLAYA DEL COUNTRY, MIRAMAR SECTOR EL FARO y SENDERO SANTA VERÓNICA 7000
  UPDATE public.operational_frequencies SET rendimiento = 3000 WHERE board_id = v_board_id AND group_id = v_gid_gastronomico AND activity_key = '3.04';
  UPDATE public.operational_frequencies SET rendimiento = 7000 WHERE board_id = v_board_id AND group_id = v_gid_country AND activity_key = '3.04';
  UPDATE public.operational_frequencies SET rendimiento = 7000 WHERE board_id = v_board_id AND group_id = v_gid_miramar AND activity_key = '3.04';
  UPDATE public.operational_frequencies SET rendimiento = 7000 WHERE board_id = v_board_id AND group_id = v_gid_veronica AND activity_key = '3.04';

  -- c) DELETE de operational_frequencies de PLAYA PUNTA ASTILLEROS (D25)
  SELECT count(*), (array_agg(id))[1] INTO v_cnt, v_gid_astilleros
  FROM public.groups
  WHERE board_id = v_board_id
    AND translate(upper(title), 'ÁÉÍÓÚ', 'AEIOU') LIKE '%ASTILLERO%';

  IF v_gid_astilleros IS NOT NULL THEN
    DELETE FROM public.operational_frequencies
    WHERE board_id = v_board_id
      AND group_id = v_gid_astilleros;
  END IF;

  -- d) Cargar site_daily_capacity (D24, source 'COSTOS GENERALES V3')
  INSERT INTO public.site_daily_capacity (board_id, group_id, jornales_dia, source)
  VALUES
    (v_board_id, v_gid_gastronomico, 13.52, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_miramar,       9.34, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_plaza,         8.32, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_sabanilla,     5.66, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_salinas,       5.45, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_country,       5.39, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_manglares,     4.49, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_veronica,      3.60, 'COSTOS GENERALES V3'),
    (v_board_id, v_gid_sazon,         0.98, 'COSTOS GENERALES V3')
  ON CONFLICT (board_id, group_id)
  DO UPDATE SET
    jornales_dia = EXCLUDED.jornales_dia,
    source = EXCLUDED.source;

  RAISE NOTICE 'Parámetros operativos y capacidades cargados exitosamente para el tablero %', v_board_id;
END $$;

-- e) Consultas de control
-- 1. Control de SPLIT y Overrides de Rendimiento
SELECT 
  g.title AS sitio,
  opf.activity_key,
  opf.visits_per_month,
  opf.qty_mode,
  opf.rendimiento AS rendimiento_override,
  opf.source
FROM public.operational_frequencies opf
JOIN public.groups g ON g.id = opf.group_id
WHERE opf.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID
  AND (opf.qty_mode = 'SPLIT' OR opf.rendimiento IS NOT NULL)
ORDER BY g.title, opf.activity_key;

-- 2. Control de Capacidad Diaria por Sitio
SELECT 
  g.title AS sitio,
  sdc.jornales_dia,
  sdc.source,
  sdc.created_at
FROM public.site_daily_capacity sdc
JOIN public.groups g ON g.id = sdc.group_id
WHERE sdc.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID
ORDER BY sdc.jornales_dia DESC;
