-- ============================================================================
-- Script de Verificación: 2g_rollback_check.sql
-- Propósito: Verificar guardia atómica D17 para sync_weekly_plan_items_rpc
-- Ejecución: SQL Editor de Supabase (Transacción con ROLLBACK garantizado)
-- ============================================================================

BEGIN;

-- 1. Crear tabla temporal antes de cambiar de rol y otorgar permisos
CREATE TEMP TABLE IF NOT EXISTS _test_results (
  caso TEXT,
  esperado TEXT,
  obtenido TEXT,
  ok BOOLEAN
) ON COMMIT DROP;

GRANT SELECT, INSERT ON TABLE _test_results TO authenticated;

-- 2. Configurar contexto de autenticación como Administrador
DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'tjho145@hotmail.com' LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Usuario administrador tjho145@hotmail.com no encontrado';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_admin_id::TEXT,
      'role', 'authenticated',
      'email', 'tjho145@hotmail.com'
    )::TEXT,
    true
  );
END $$;

SET LOCAL ROLE authenticated;

-- 3. Ejecutar los casos de prueba capturando excepciones
DO $$
DECLARE
  v_existing_plan_id UUID := '50832ac1-2600-47d0-aef9-9a51980481f1'::UUID;
  v_manglares_board_id UUID := '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID;
  v_manglares_group_id UUID := '662748a7-7731-4e90-9782-527ba0caacc4'::UUID;
  v_new_plan_id UUID;
  v_override_plan_id UUID;
  v_foreign_zone_id UUID;
  v_valid_zone_id UUID;
  v_valid_activity_key TEXT;
  v_std_rendimiento NUMERIC := 100;
  v_std_frecuencia NUMERIC := 1;
  v_std_priority TEXT := 'must_execute';
  v_std_unit TEXT := 'UNIDAD';
  v_msg TEXT;
  v_code TEXT;
  v_count INT;
  v_inserted_override BOOLEAN;
BEGIN
  -- Caso 1: Plan existente con ítems -> Espera PLAN_NOT_EMPTY
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_existing_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', 10,
          'planned_jr', 1,
          'poa_activity_zone_id', 'a0000000-0000-0000-0000-000000000001',
          'planned_date', '2026-09-28'
        )
      )
    );
    INSERT INTO _test_results VALUES ('01. Plan existente con ítems', 'PLAN_NOT_EMPTY', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '01. Plan existente con ítems',
      'PLAN_NOT_EMPTY',
      COALESCE(v_code, v_msg),
      v_code = 'PLAN_NOT_EMPTY'
    );
  END;

  -- Crear plan nuevo para Manglares semana 2099-01-05
  v_new_plan_id := public.ensure_weekly_plan_header(
    v_manglares_board_id,
    v_manglares_group_id,
    '2099-01-05'::DATE,
    1
  );

  -- Obtener una zona de OTRO sitio para caso 2
  SELECT id INTO v_foreign_zone_id 
  FROM public.poa_activity_zones 
  WHERE zone_id <> v_manglares_group_id 
  LIMIT 1;

  -- Caso 2: Plan nuevo con zona de otro sitio -> Espera ZONE_MISMATCH
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_new_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', 10,
          'planned_jr', 1,
          'poa_activity_zone_id', COALESCE(v_foreign_zone_id, 'b0000000-0000-0000-0000-000000000002'::UUID),
          'planned_date', '2099-01-05'
        )
      )
    );
    INSERT INTO _test_results VALUES ('02. Ítem con zona de otro sitio', 'ZONE_MISMATCH', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '02. Ítem con zona de otro sitio',
      'ZONE_MISMATCH',
      COALESCE(v_code, v_msg),
      v_code = 'ZONE_MISMATCH'
    );
  END;

  -- Caso 3: Plan nuevo con ítem sin zona válida -> Espera INVALID_ITEM
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_new_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', 10,
          'planned_jr', 1,
          'poa_activity_zone_id', 'not-a-uuid',
          'planned_date', '2099-01-05'
        )
      )
    );
    INSERT INTO _test_results VALUES ('03. Ítem sin zona válida', 'INVALID_ITEM', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '03. Ítem sin zona válida',
      'INVALID_ITEM',
      COALESCE(v_code, v_msg),
      v_code = 'INVALID_ITEM'
    );
  END;

  -- Caso 4: Secuencia duplicada en payload -> Espera DUPLICATE_SEQUENCE
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_new_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', 10,
          'planned_jr', 1,
          'poa_activity_zone_id', 'c0000000-0000-0000-0000-000000000003',
          'planned_date', '2099-01-05'
        ),
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.02',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', 5,
          'planned_jr', 1,
          'poa_activity_zone_id', 'c0000000-0000-0000-0000-000000000003',
          'planned_date', '2099-01-06'
        )
      )
    );
    INSERT INTO _test_results VALUES ('04. Secuencia duplicada en payload', 'DUPLICATE_SEQUENCE', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '04. Secuencia duplicada en payload',
      'DUPLICATE_SEQUENCE',
      COALESCE(v_code, v_msg),
      v_code = 'DUPLICATE_SEQUENCE'
    );
  END;

  -- Caso 6: planned_qty como string "10" (antes del caso 5) -> Espera INVALID_ITEM
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_new_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', '10',
          'planned_jr', 1,
          'poa_activity_zone_id', 'a0000000-0000-0000-0000-000000000001',
          'planned_date', '2099-01-05'
        )
      )
    );
    INSERT INTO _test_results VALUES ('06. planned_qty como string', 'INVALID_ITEM', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '06. planned_qty como string',
      'INVALID_ITEM',
      COALESCE(v_code, v_msg),
      v_code = 'INVALID_ITEM'
    );
  END;

  -- Caso 7: planned_date fuera de semana (2099-01-20 vs 2099-01-05, antes del caso 5) -> Espera DATE_OUT_OF_WEEK
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_new_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_qty', 10,
          'planned_jr', 1,
          'poa_activity_zone_id', 'a0000000-0000-0000-0000-000000000001',
          'planned_date', '2099-01-20'
        )
      )
    );
    INSERT INTO _test_results VALUES ('07. planned_date fuera de semana', 'DATE_OUT_OF_WEEK', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '07. planned_date fuera de semana',
      'DATE_OUT_OF_WEEK',
      COALESCE(v_code, v_msg),
      v_code = 'DATE_OUT_OF_WEEK'
    );
  END;

  -- Caso 10: Ítem SIN la clave planned_qty (ausente, antes del caso 5) -> Espera INVALID_ITEM
  BEGIN
    PERFORM public.sync_weekly_plan_items_rpc(
      v_new_plan_id,
      jsonb_build_array(
        jsonb_build_object(
          'planned_sequence', 1,
          'activity_key', '1.01',
          'planned_rendimiento', 100,
          'planned_frecuencia', 1,
          'priority', 'must_execute',
          'unit', 'M2',
          'planned_jr', 1,
          'poa_activity_zone_id', 'a0000000-0000-0000-0000-000000000001',
          'planned_date', '2099-01-05'
        )
      )
    );
    INSERT INTO _test_results VALUES ('10. planned_qty ausente', 'INVALID_ITEM', 'SUCCESS_UNEXPECTED', false);
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
    INSERT INTO _test_results VALUES (
      '10. planned_qty ausente',
      'INVALID_ITEM',
      COALESCE(v_code, v_msg),
      v_code = 'INVALID_ITEM'
    );
  END;

  -- Buscar zona real de Manglares vinculada a su POA activo para caso 5
  SELECT paz.id, pa.activity_key 
  INTO v_valid_zone_id, v_valid_activity_key
  FROM public.poa_activity_zones paz
  JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
  JOIN public.poa_versions pv ON pv.id = pa.poa_version_id AND pv.status = 'active'
  JOIN public.poa p ON p.id = pv.poa_id AND p.board_id = v_manglares_board_id
  WHERE paz.zone_id = v_manglares_group_id
  LIMIT 1;

  IF v_valid_zone_id IS NOT NULL THEN
    -- Obtener estándar real del tablero para esa actividad
    SELECT 
      COALESCE(bas.rendimiento, 100),
      COALESCE(bas.priority, 'must_execute'),
      COALESCE(bas.unit, 'M2')
    INTO v_std_rendimiento, v_std_priority, v_std_unit
    FROM public.board_activity_standards bas
    WHERE bas.board_id = v_manglares_board_id 
      AND bas.activity_key = v_valid_activity_key
      AND bas.effective_to IS NULL
    LIMIT 1;

    -- Caso 5: Ítem válido con zona real de Manglares -> Éxito (1 fila)
    BEGIN
      SELECT COUNT(*) INTO v_count
      FROM public.sync_weekly_plan_items_rpc(
        v_new_plan_id,
        jsonb_build_array(
          jsonb_build_object(
            'planned_sequence', 1,
            'activity_key', v_valid_activity_key,
            'planned_rendimiento', v_std_rendimiento,
            'planned_frecuencia', v_std_frecuencia,
            'priority', v_std_priority,
            'unit', v_std_unit,
            'planned_qty', 10,
            'planned_jr', 1,
            'poa_activity_zone_id', v_valid_zone_id,
            'planned_date', '2099-01-05'
          )
        )
      );
      INSERT INTO _test_results VALUES (
        '05. Ítem válido con zona real de Manglares',
        '1 fila insertada',
        v_count || ' filas insertadas',
        v_count = 1
      );
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
      INSERT INTO _test_results VALUES (
        '05. Ítem válido con zona real de Manglares',
        '1 fila insertada',
        'ERROR: ' || v_msg,
        false
      );
    END;

    -- Caso 8: Repetir sincronización sobre el plan del caso 5 (ya no vacío) -> Espera PLAN_NOT_EMPTY
    BEGIN
      PERFORM public.sync_weekly_plan_items_rpc(
        v_new_plan_id,
        jsonb_build_array(
          jsonb_build_object(
            'planned_sequence', 2,
            'activity_key', v_valid_activity_key,
            'planned_rendimiento', v_std_rendimiento,
            'planned_frecuencia', v_std_frecuencia,
            'priority', v_std_priority,
            'unit', v_std_unit,
            'planned_qty', 15,
            'planned_jr', 1,
            'poa_activity_zone_id', v_valid_zone_id,
            'planned_date', '2099-01-06'
          )
        )
      );
      INSERT INTO _test_results VALUES ('08. Repetir sync en plan no vacío', 'PLAN_NOT_EMPTY', 'SUCCESS_UNEXPECTED', false);
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
      v_code := SUBSTRING(v_msg FROM '\[([A-Z_]+)\]');
      INSERT INTO _test_results VALUES (
        '08. Repetir sync en plan no vacío',
        'PLAN_NOT_EMPTY',
        COALESCE(v_code, v_msg),
        v_code = 'PLAN_NOT_EMPTY'
      );
    END;

    -- Caso 9: is_manual_override forzado a false en plan nuevo 2099-01-12
    v_override_plan_id := public.ensure_weekly_plan_header(
      v_manglares_board_id,
      v_manglares_group_id,
      '2099-01-12'::DATE,
      2
    );

    BEGIN
      PERFORM public.sync_weekly_plan_items_rpc(
        v_override_plan_id,
        jsonb_build_array(
          jsonb_build_object(
            'planned_sequence', 1,
            'activity_key', v_valid_activity_key,
            'planned_rendimiento', v_std_rendimiento,
            'planned_frecuencia', v_std_frecuencia,
            'priority', v_std_priority,
            'unit', v_std_unit,
            'planned_qty', 10,
            'planned_jr', 1,
            'poa_activity_zone_id', v_valid_zone_id,
            'planned_date', '2099-01-12',
            'is_manual_override', true,
            'override_reason', 'Intento de override en gateway'
          )
        )
      );

      SELECT is_manual_override INTO v_inserted_override
      FROM public.weekly_plan_items
      WHERE plan_id = v_override_plan_id AND planned_sequence = 1;

      INSERT INTO _test_results VALUES (
        '09. is_manual_override ignorado y forzado a false',
        'false',
        COALESCE(v_inserted_override::TEXT, 'NULL'),
        v_inserted_override = false
      );
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
      INSERT INTO _test_results VALUES (
        '09. is_manual_override ignorado y forzado a false',
        'false',
        'ERROR: ' || v_msg,
        false
      );
    END;

  ELSE
    -- Requisito: Si no hay zona real, ok = false y NO_EJECUTADO
    INSERT INTO _test_results VALUES (
      '05. Ítem válido con zona real de Manglares',
      '1 fila insertada',
      'NO_EJECUTADO (no hay zona previa en base de datos para Manglares)',
      false
    );
    INSERT INTO _test_results VALUES (
      '08. Repetir sync en plan no vacío',
      'PLAN_NOT_EMPTY',
      'NO_EJECUTADO',
      false
    );
    INSERT INTO _test_results VALUES (
      '09. is_manual_override ignorado y forzado a false',
      'false',
      'NO_EJECUTADO',
      false
    );
  END IF;

END $$;

-- 4. Devolver resumen de casos ejecutados
SELECT caso, esperado, obtenido, ok FROM _test_results ORDER BY caso;

-- 5. Revertir todas las mutaciones realizadas en la verificación
ROLLBACK;
