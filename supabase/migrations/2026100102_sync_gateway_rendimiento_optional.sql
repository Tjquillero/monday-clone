-- ============================================================================
-- Migración: 2026100102_sync_gateway_rendimiento_optional.sql
-- Propósito: Actualización de sync_weekly_plan_items_rpc para soportar actividades
--            con requiere_rendimiento = false (D20 / FREQ-OP-01b).
-- Base: 2026093001_sync_gateway_guard_d17.sql con validación condicional de planned_rendimiento.
-- 1. Permitir NULL en planned_rendimiento para actividades con requiere_rendimiento = false (D20)
ALTER TABLE public.weekly_plan_items ALTER COLUMN planned_rendimiento DROP NOT NULL;
ALTER TABLE public.weekly_plan_items ADD CONSTRAINT weekly_plan_items_rendimiento_d20_chk
  CHECK ((planned_rendimiento IS NULL AND planned_jr = 0) OR planned_rendimiento > 0) NOT VALID;

CREATE OR REPLACE FUNCTION public.sync_weekly_plan_items_rpc(
  p_plan_id UUID,
  p_items   JSONB
)
RETURNS SETOF public.weekly_plan_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_board_id UUID;
  v_group_id UUID;
  v_status TEXT;
  v_week_start DATE;
  v_active_version_count INT;
  v_active_version_id UUID;
  v_item JSONB;
  v_seq_text TEXT;
  v_act_key TEXT;
  v_priority TEXT;
  v_unit TEXT;
  v_paz_id_text TEXT;
  v_std_id_text TEXT;
  v_date_text TEXT;
  v_date DATE;
  v_zone_match BOOLEAN;
  v_duplicate_seq BOOLEAN;
  v_requiere_rendimiento BOOLEAN;
BEGIN
  -- a) auth.uid() nulo -> [UNAUTHENTICATED]
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '[UNAUTHENTICATED] Acceso denegado: Usuario no autenticado';
  END IF;

  -- b) p_items nulo, no es arreglo JSON o está vacío -> [EMPTY_PAYLOAD]
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION '[EMPTY_PAYLOAD] El payload de ítems es nulo, no es un arreglo JSON o está vacío';
  END IF;

  -- c) SELECT board_id, group_id, status, week_start FROM weekly_plans WHERE id = p_plan_id FOR UPDATE
  SELECT board_id, group_id, status, week_start 
  INTO v_board_id, v_group_id, v_status, v_week_start
  FROM public.weekly_plans 
  WHERE id = p_plan_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION '[PLAN_NOT_FOUND] Plan semanal % no encontrado', p_plan_id;
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION '[PLAN_WITHOUT_SITE] El plan semanal % no tiene un sitio (group_id) asignado', p_plan_id;
  END IF;

  IF v_status IN ('cancelled', 'closed') THEN
    RAISE EXCEPTION '[PLAN_TERMINAL] El plan semanal % se encuentra en estado terminal (%)', p_plan_id, v_status;
  END IF;

  -- d) NOT can_report_execution(board_id, auth.uid()) -> [FORBIDDEN]
  IF NOT public.can_report_execution(v_board_id, auth.uid()) THEN
    RAISE EXCEPTION '[FORBIDDEN] Usuario no autorizado para sincronizar ítems en el tablero %', v_board_id;
  END IF;

  -- e) El sitio no pertenece al tablero -> [SITE_BOARD_MISMATCH]
  IF NOT EXISTS (
    SELECT 1 FROM public.groups WHERE id = v_group_id AND board_id = v_board_id
  ) THEN
    RAISE EXCEPTION '[SITE_BOARD_MISMATCH] El sitio % no pertenece al tablero %', v_group_id, v_board_id;
  END IF;

  -- f) EXISTS ítems en weekly_plan_items para ese plan -> [PLAN_NOT_EMPTY] (D14 atómica)
  IF EXISTS (
    SELECT 1 FROM public.weekly_plan_items WHERE plan_id = p_plan_id
  ) THEN
    RAISE EXCEPTION '[PLAN_NOT_EMPTY] El plan semanal % ya contiene ítems. D14/D17 prohíbe sobreescrituras y adiciones a planes no vacíos', p_plan_id;
  END IF;

  -- g) Versión de POA activa del tablero: poa (board_id) -> poa_versions status 'active'. Distinto de exactamente 1 -> [ACTIVE_POA_VERSION_INVALID]
  SELECT COUNT(*), (ARRAY_AGG(pv.id))[1]
  INTO v_active_version_count, v_active_version_id
  FROM public.poa p
  JOIN public.poa_versions pv ON pv.poa_id = p.id AND pv.status = 'active'
  WHERE p.board_id = v_board_id;

  IF v_active_version_count <> 1 THEN
    RAISE EXCEPTION '[ACTIVE_POA_VERSION_INVALID] El tablero % tiene % versiones de POA activas (se requiere exactamente 1)', v_board_id, v_active_version_count;
  END IF;

  -- h) planned_sequence repetido dentro de p_items -> [DUPLICATE_SEQUENCE]
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS elem
    WHERE jsonb_typeof(elem->'planned_sequence') = 'number'
    GROUP BY elem->>'planned_sequence'
    HAVING COUNT(*) > 1
  ) INTO v_duplicate_seq;

  IF v_duplicate_seq THEN
    RAISE EXCEPTION '[DUPLICATE_SEQUENCE] El payload contiene secuencias (planned_sequence) duplicadas';
  END IF;

  -- i) Validación ítem por ítem (reporta la primera secuencia inválida y el motivo)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_seq_text := v_item->>'planned_sequence';
    v_act_key := v_item->>'activity_key';
    v_priority := v_item->>'priority';
    v_unit := v_item->>'unit';
    v_paz_id_text := v_item->>'poa_activity_zone_id';
    v_std_id_text := v_item->>'activity_standard_id';
    v_date_text := v_item->>'planned_date';

    -- 1. planned_sequence: tipo number y entero > 0
    IF jsonb_typeof(v_item->'planned_sequence') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '[INVALID_ITEM] planned_sequence ausente o no es un número: %', COALESCE(v_seq_text, 'NULL');
    ELSE
      IF v_seq_text !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION '[INVALID_ITEM] planned_sequence inválido (debe ser número entero > 0): %', v_seq_text;
      END IF;
    END IF;

    -- 2. activity_key: no nulo ni vacío
    IF v_act_key IS NULL OR trim(v_act_key) = '' THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: activity_key nulo o vacío', v_seq_text;
    END IF;

    -- 3. planned_qty: tipo number y >= 0
    IF jsonb_typeof(v_item->'planned_qty') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_qty ausente o no es un número: %', v_seq_text, COALESCE(v_item->>'planned_qty', 'NULL');
    ELSE
      IF (v_item->>'planned_qty')::NUMERIC < 0 THEN
        RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_qty negativo: %', v_seq_text, v_item->>'planned_qty';
      END IF;
    END IF;

    -- 4. Consulta de requiere_rendimiento en board_activity_standards
    v_requiere_rendimiento := true;
    IF v_std_id_text IS NOT NULL AND v_std_id_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      SELECT bas.requiere_rendimiento
      INTO v_requiere_rendimiento
      FROM public.board_activity_standards bas
      WHERE bas.id = v_std_id_text::UUID
        AND bas.board_id = v_board_id;
    ELSE
      SELECT bas.requiere_rendimiento
      INTO v_requiere_rendimiento
      FROM public.board_activity_standards bas
      WHERE bas.board_id = v_board_id
        AND bas.activity_key = v_act_key
      ORDER BY bas.created_at DESC
      LIMIT 1;
    END IF;
    v_requiere_rendimiento := COALESCE(v_requiere_rendimiento, true);

    -- 5. planned_rendimiento y planned_jr según requiere_rendimiento (D20)
    IF v_requiere_rendimiento = false THEN
      -- planned_rendimiento puede ser NULL o número > 0
      IF jsonb_typeof(v_item->'planned_rendimiento') IS DISTINCT FROM 'null' AND v_item ? 'planned_rendimiento' THEN
        IF jsonb_typeof(v_item->'planned_rendimiento') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_rendimiento no es un número ni nulo: %', v_seq_text, COALESCE(v_item->>'planned_rendimiento', 'NULL');
        ELSE
          IF (v_item->>'planned_rendimiento')::NUMERIC <= 0 THEN
            RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_rendimiento no positivo: %', v_seq_text, v_item->>'planned_rendimiento';
          END IF;
        END IF;
      END IF;

      -- planned_jr debe ser exactamente 0
      IF jsonb_typeof(v_item->'planned_jr') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_jr ausente o no es un número: %', v_seq_text, COALESCE(v_item->>'planned_jr', 'NULL');
      ELSE
        IF (v_item->>'planned_jr')::NUMERIC <> 0 THEN
          RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_jr debe ser 0 para actividad con requiere_rendimiento = false: %', v_seq_text, v_item->>'planned_jr';
        END IF;
      END IF;
    ELSE
      -- requiere_rendimiento = true: exige planned_rendimiento > 0 con código [RENDIMIENTO_REQUIRED] si falta
      IF jsonb_typeof(v_item->'planned_rendimiento') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION '[RENDIMIENTO_REQUIRED] Secuencia %: planned_rendimiento es requerido para actividad con requiere_rendimiento = true: %', v_seq_text, COALESCE(v_item->>'planned_rendimiento', 'NULL');
      ELSE
        IF (v_item->>'planned_rendimiento')::NUMERIC <= 0 THEN
          RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_rendimiento no positivo: %', v_seq_text, v_item->>'planned_rendimiento';
        END IF;
      END IF;

      -- planned_jr: tipo number y >= 0
      IF jsonb_typeof(v_item->'planned_jr') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_jr ausente o no es un número: %', v_seq_text, COALESCE(v_item->>'planned_jr', 'NULL');
      ELSE
        IF (v_item->>'planned_jr')::NUMERIC < 0 THEN
          RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_jr negativo: %', v_seq_text, v_item->>'planned_jr';
        END IF;
      END IF;
    END IF;

    -- 6. planned_frecuencia: tipo number y > 0
    IF jsonb_typeof(v_item->'planned_frecuencia') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_frecuencia ausente o no es un número: %', v_seq_text, COALESCE(v_item->>'planned_frecuencia', 'NULL');
    ELSE
      IF (v_item->>'planned_frecuencia')::NUMERIC <= 0 THEN
        RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_frecuencia no positivo: %', v_seq_text, v_item->>'planned_frecuencia';
      END IF;
    END IF;

    -- 7. priority: IN ('must_execute', 'preferred', 'flexible')
    IF v_priority IS NULL OR v_priority NOT IN ('must_execute', 'preferred', 'flexible') THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: priority inválida (debe ser must_execute, preferred o flexible): %', v_seq_text, COALESCE(v_priority, 'NULL');
    END IF;

    -- 8. unit: no nulo ni vacío
    IF v_unit IS NULL OR trim(v_unit) = '' THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: unit nulo o vacío', v_seq_text;
    END IF;

    -- 9. planned_date: convertible a date y dentro de la semana
    IF v_date_text IS NULL OR v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_date ausente o formato inválido (YYYY-MM-DD): %', v_seq_text, COALESCE(v_date_text, 'NULL');
    END IF;
    BEGIN
      v_date := v_date_text::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: planned_date no es una fecha válida: %', v_seq_text, v_date_text;
    END;

    IF v_date < v_week_start OR v_date > (v_week_start + 6) THEN
      RAISE EXCEPTION '[DATE_OUT_OF_WEEK] Secuencia %: planned_date % está fuera de la semana del plan (% a %)', v_seq_text, v_date_text, v_week_start, (v_week_start + 6);
    END IF;

    -- 10. poa_activity_zone_id: uuid válido
    IF v_paz_id_text IS NULL OR v_paz_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION '[INVALID_ITEM] Secuencia %: poa_activity_zone_id ausente o no es uuid válido: %', v_seq_text, COALESCE(v_paz_id_text, 'NULL');
    END IF;

    -- 11. poa_activity_zones: existencia para el sitio y versión de POA activa
    SELECT EXISTS (
      SELECT 1
      FROM public.poa_activity_zones paz
      JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
      WHERE paz.id = v_paz_id_text::UUID
        AND paz.zone_id = v_group_id
        AND pa.poa_version_id = v_active_version_id
        AND pa.activity_key = v_act_key
    ) INTO v_zone_match;

    IF NOT v_zone_match THEN
      RAISE EXCEPTION '[ZONE_MISMATCH] Secuencia %: poa_activity_zone_id % no coincide con el sitio % y la actividad % en la versión activa de POA %', v_seq_text, v_paz_id_text, v_group_id, v_act_key, v_active_version_id;
    END IF;
  END LOOP;

  -- j) Inserción atómica sin filtro silencioso ni manejo de conflictos
  RETURN QUERY
  INSERT INTO public.weekly_plan_items (
    plan_id,
    planned_sequence,
    activity_key,
    planned_rendimiento,
    planned_frecuencia,
    priority,
    planned_qty,
    unit,
    planned_jr,
    poa_activity_zone_id,
    planned_date,
    occurrence_key,
    is_manual_override,
    override_reason
  )
  SELECT
    p_plan_id,
    (item->>'planned_sequence')::INT,
    item->>'activity_key',
    CASE WHEN jsonb_typeof(item->'planned_rendimiento') = 'number' THEN (item->>'planned_rendimiento')::NUMERIC ELSE NULL END,
    (item->>'planned_frecuencia')::NUMERIC,
    item->>'priority',
    (item->>'planned_qty')::NUMERIC,
    item->>'unit',
    (item->>'planned_jr')::NUMERIC,
    (item->>'poa_activity_zone_id')::UUID,
    (item->>'planned_date')::DATE,
    item->>'occurrence_key',
    false,
    NULL
  FROM jsonb_array_elements(p_items) AS item
  RETURNING *;
END;
$$;

-- Permisos explícitos
REVOKE EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.sync_weekly_plan_items_rpc(UUID, JSONB) IS 'Gateway RPC para sincronización atómica de weekly_plan_items (D14/D17/D20). Permite planned_rendimiento NULL y planned_jr = 0 cuando requiere_rendimiento = false en el estándar técnico.';
