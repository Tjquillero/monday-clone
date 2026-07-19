-- =============================================================================
-- import_poa_version — persistir description/unit en poa_activities
-- Ref: docs/architecture/poa-technical-catalog-decoupling.md, Decisión 1
--
-- Único cambio respecto a supabase/migrations/20260725_import_poa_version_
-- zones_and_activation.sql: el INSERT de poa_activities agrega description/
-- unit desde p_activities (mismo patrón que activity_key/precio_unitario/
-- frecuencia — ya vienen de ParsedActivity.descripcion/ParsedActivity.unidad
-- en el cliente, nunca se persistían hasta la migración anterior de este
-- incremento). Ninguna otra lógica de la función cambia.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_poa_version(
  p_poa_id              UUID,
  p_activities          JSONB,
  p_import_operation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_poa                  public.poa%ROWTYPE;
  v_existing_id           UUID;
  v_next_version          INT;
  v_version_id            UUID;
  v_expected_zone_count   INT;
  v_actual_zone_count     INT;
BEGIN
  -- ── Idempotencia: si esta operación ya se ejecutó, devolver su resultado
  --    sin crear nada nuevo ni lanzar error (mismo criterio que
  --    processed_domain_commands: reintentar es seguro). Independiente del
  --    status actual de la versión — una versión ya cerrada por una
  --    importación posterior sigue siendo la respuesta correcta para esta
  --    operación específica.
  IF p_import_operation_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.poa_versions
    WHERE import_operation_id = p_import_operation_id;

    IF FOUND THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- ── Precondiciones mínimas (no reglas de negocio del importador) ───────────
  SELECT * INTO v_poa
  FROM public.poa
  WHERE id = p_poa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POA % no encontrado', p_poa_id;
  END IF;

  IF NOT public.can_manage_poa(v_poa.board_id, auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para importar una versión de este POA';
  END IF;

  IF p_activities IS NULL OR jsonb_typeof(p_activities) != 'array' THEN
    RAISE EXCEPTION 'p_activities debe ser un array JSON';
  END IF;

  -- ── Numeración de versión ────────────────────────────────────────────────
  -- El lock FOR UPDATE sobre la fila `poa` (arriba) ya serializa llamadas
  -- concurrentes para el mismo poa_id, así que MAX(version_number)+1 aquí
  -- es seguro frente a condiciones de carrera. La serialización depende del
  -- propio SELECT ... FOR UPDATE, no de que use un índice: FOR UPDATE
  -- bloquea exactamente las filas devueltas por la consulta,
  -- independientemente de si el planificador elige Index Scan o Seq Scan.
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.poa_versions
  WHERE poa_id = p_poa_id;

  -- ── Crear la versión — arranca 'draft'; se activa al final de esta misma
  --    función, solo si todo lo demás fue consistente. ─────────────────────
  INSERT INTO public.poa_versions (
    poa_id, version_number, status, created_by, import_operation_id
  ) VALUES (
    p_poa_id, v_next_version, 'draft', auth.uid(), p_import_operation_id
  )
  RETURNING id INTO v_version_id;

  -- ── Insertar poa_activities, preservando el orden de p_activities ──────────
  INSERT INTO public.poa_activities (
    poa_version_id, activity_key, description, unit, precio_unitario, frecuencia, import_order
  )
  SELECT
    v_version_id,
    item->>'activity_key',
    item->>'description',
    item->>'unit',
    (item->>'precio_unitario')::NUMERIC,
    (item->>'frecuencia')::NUMERIC,
    (ord - 1)::INT
  FROM jsonb_array_elements(p_activities) WITH ORDINALITY AS t(item, ord);

  -- ── Insertar poa_activity_zones, con orden propio (zone_import_order),
  --    correlacionando cada bloque de zonas con su actividad vía
  --    import_order (recién asignado arriba, único dentro de esta versión).
  INSERT INTO public.poa_activity_zones (
    poa_activity_id, zone_id, cantidad_contratada, zone_import_order
  )
  SELECT
    pa.id,
    (zona->>'group_id')::UUID,
    (zona->>'cantidad_contratada')::NUMERIC,
    (zona_ord - 1)::INT
  FROM jsonb_array_elements(p_activities) WITH ORDINALITY AS act(item, act_ord)
  JOIN public.poa_activities pa
    ON pa.poa_version_id = v_version_id
   AND pa.import_order    = (act_ord - 1)::INT
  CROSS JOIN LATERAL jsonb_array_elements(act.item->'zonas') WITH ORDINALITY AS zona(zona, zona_ord);

  -- ── Verificación de consistencia completa antes de activar ─────────────────
  -- 1. Ninguna actividad insertada puede quedar sin al menos una zona.
  IF EXISTS (
    SELECT 1 FROM public.poa_activities pa
    WHERE pa.poa_version_id = v_version_id
      AND NOT EXISTS (
        SELECT 1 FROM public.poa_activity_zones paz WHERE paz.poa_activity_id = pa.id
      )
  ) THEN
    RAISE EXCEPTION 'Actividad sin ninguna zona asociada — la importación se revierte por completo';
  END IF;

  -- 2. El total de zonas insertadas coincide exactamente con lo esperado del
  --    JSON — no se asume que el INSERT + JOIN de arriba fue correcto.
  SELECT COALESCE(SUM(jsonb_array_length(item->'zonas')), 0) INTO v_expected_zone_count
  FROM jsonb_array_elements(p_activities) AS item;

  SELECT COUNT(*) INTO v_actual_zone_count
  FROM public.poa_activity_zones paz
  JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
  WHERE pa.poa_version_id = v_version_id;

  IF v_actual_zone_count != v_expected_zone_count THEN
    RAISE EXCEPTION 'Inconsistencia: % zonas esperadas, % insertadas', v_expected_zone_count, v_actual_zone_count;
  END IF;

  -- ── Transición draft -> active. Solo aquí, después de que 1 y 2 pasaron.
  --    La versión anteriormente activa (si existe) pasa a 'closed' en la
  --    misma operación. ─────────────────────────────────────────────────────
  UPDATE public.poa_versions
  SET status = 'closed', closed_at = NOW()
  WHERE poa_id = p_poa_id AND status = 'active';

  UPDATE public.poa_versions
  SET status = 'active', published_by = auth.uid(), published_at = NOW()
  WHERE id = v_version_id;

  RETURN v_version_id;
END;
$$;
