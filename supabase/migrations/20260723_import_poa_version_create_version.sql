-- =============================================================================
-- import_poa_version — Commit 2/4: creación de poa_version
-- Ref: supabase/migrations/20260721_import_poa_version.sql,
--      supabase/migrations/20260722_import_poa_version_idempotency.sql
--
-- Alcance de este commit, deliberadamente estrecho:
--   - Crea exactamente un registro en poa_versions.
--   - Asigna version_number correctamente (MAX existente + 1 por poa_id).
--   - status = 'draft' — NUNCA 'active' aquí: una versión sin actividades
--     todavía no es válida como "vigente" (Regla 12 de poa-domain.md). Pasar
--     a 'active' es responsabilidad del Commit 4, una vez que
--     poa_activities/poa_activity_zones también existen.
--   - Devuelve el id de la versión creada.
--   - Todavía NO inserta poa_activities ni poa_activity_zones (Commits 3-4).
--
-- Firma sin cambios respecto al commit anterior — no hace falta DROP
-- FUNCTION, un CREATE OR REPLACE con la misma lista de parámetros sí
-- reemplaza correctamente (a diferencia de cambiar la firma).
--
-- Comportamiento de este commit cuando p_activities NO está vacío: la
-- versión se crea, pero la función sigue sin poder completar la
-- importación (Commits 3-4 pendientes) — RAISE EXCEPTION revierte TODO lo
-- hecho hasta ese punto, incluida la poa_version recién creada. Esto no es
-- un caso especial: es el comportamiento transaccional normal de una
-- función de Postgres sin manejador de excepciones, y se demuestra con un
-- test explícito (no se asume) — ver Test 10 de
-- supabase/tests/05_import_poa_version.sql.
--
-- Cuando p_activities SÍ está vacío (`[]`), no hay nada más que hacer en el
-- alcance actual del importador: la función completa exitosamente con solo
-- la poa_version creada. Este es el único caso que hoy puede terminar en
-- éxito real de punta a punta — es lo que permite probar la creación y la
-- numeración de versiones sin inventar una función auxiliar con su propia
-- superficie de seguridad paralela.
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
  v_poa            public.poa%ROWTYPE;
  v_existing_id    UUID;
  v_next_version   INT;
  v_version_id     UUID;
BEGIN
  -- ── Idempotencia: si esta operación ya se ejecutó, devolver su resultado
  --    sin crear nada nuevo ni lanzar error (mismo criterio que
  --    processed_domain_commands: reintentar es seguro).
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
  -- es seguro frente a condiciones de carrera — mismo criterio que el
  -- trigger de board_activity_standards (20260708_scheduler_engine.sql).
  --
  -- La serialización depende del propio SELECT ... FOR UPDATE de arriba
  -- (`WHERE id = p_poa_id`), no de que use un índice: FOR UPDATE bloquea
  -- exactamente las filas devueltas por la consulta — esa garantía es parte
  -- de la especificación del motor, independiente de si el planificador
  -- elige Index Scan o Seq Scan (a esta escala de tabla, Postgres elige
  -- Seq Scan por costo, y sigue bloqueando solo la fila devuelta). Dos
  -- importaciones del mismo poa_id se serializan; dos poa_id distintos
  -- avanzan en paralelo sin bloquearse entre sí.
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.poa_versions
  WHERE poa_id = p_poa_id;

  -- ── Crear la versión — SIEMPRE 'draft'. Solo el Commit 4, después de
  --    insertar actividades y zonas y verificar consistencia, puede marcarla
  --    'active'. ───────────────────────────────────────────────────────────
  INSERT INTO public.poa_versions (
    poa_id, version_number, status, created_by, import_operation_id
  ) VALUES (
    p_poa_id, v_next_version, 'draft', auth.uid(), p_import_operation_id
  )
  RETURNING id INTO v_version_id;

  -- ── Commits 3-4: insertar poa_activities y poa_activity_zones a partir de
  --    p_activities, verificar consistencia, y marcar la versión 'active'.
  --    Mientras eso no exista, cualquier importación con actividades reales
  --    debe fallar aquí — y al fallar, revertir también la poa_version que
  --    se acaba de crear arriba (comportamiento transaccional normal de
  --    Postgres, verificado explícitamente por test, no asumido).
  IF jsonb_array_length(p_activities) > 0 THEN
    RAISE EXCEPTION 'import_poa_version: inserción de actividades pendiente de implementar (Incremento 5, capa 4, commits 3-4)';
  END IF;

  RETURN v_version_id;
END;
$$;
