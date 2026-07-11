-- =============================================================================
-- import_poa_version — Commit 3/4: inserción de poa_activities
-- Ref: supabase/migrations/20260723_import_poa_version_create_version.sql
--
-- Alcance de este commit, deliberadamente estrecho:
--   - Inserta poa_activities a partir de p_activities, preservando el orden
--     de llegada del array (import_order, columna nueva — ver abajo).
--   - NO cambia el status de la poa_version (sigue 'draft').
--   - NO inserta poa_activity_zones todavía (Commit 4).
--   - Atomicidad completa: si alguna actividad trae zonas (indicando que la
--     importación real necesita el Commit 4, que todavía no existe), la
--     función falla y revierte TODO — poa_version y poa_activities por
--     igual. No se re-verifica activity_key/frecuencia/precio_unitario:
--     esa validación ya ocurrió en las capas 1-3 (src/lib/poaImport/); el
--     schema (NOT NULL, CHECK) es la única red de seguridad adicional aquí.
--
-- import_order: preserva la posición de cada actividad dentro del array
-- p_activities tal como lo envió el llamador. En este pipeline, capas 1-3
-- mantienen el orden de aparición en el Excel al construir ese array, así
-- que hoy equivale al orden del archivo original — sin necesidad de
-- transportar el número de fila del Excel hasta la base de datos. Facilita
-- reconstruir "por qué la actividad N quedó en esa posición" meses después,
-- comparando contra el archivo fuente.
--
-- Éxito de punta a punta en el alcance de este commit: cuando NINGUNA
-- actividad trae zonas (`zonas: []` en cada elemento), la función completa
-- exitosamente tras insertar poa_activities — mismo criterio que el Commit 2
-- con p_activities = '[]': el único caso de éxito real posible en este
-- alcance, sin inventar una función auxiliar paralela. En datos reales,
-- toda actividad validada por las capas 1-3 trae al menos una zona (una
-- actividad sin zonas se reporta en `noContratadas` y nunca llega aquí) —
-- este caso de "zonas vacías" es exclusivamente para poder probar esta capa
-- de forma aislada del Commit 4, que todavía no existe.
-- =============================================================================

ALTER TABLE public.poa_activities
  ADD COLUMN IF NOT EXISTS import_order INT NOT NULL DEFAULT 0;

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

  -- ── Insertar poa_activities, preservando el orden de p_activities ──────────
  INSERT INTO public.poa_activities (
    poa_version_id, activity_key, precio_unitario, frecuencia, import_order
  )
  SELECT
    v_version_id,
    item->>'activity_key',
    (item->>'precio_unitario')::NUMERIC,
    (item->>'frecuencia')::NUMERIC,
    (ord - 1)::INT
  FROM jsonb_array_elements(p_activities) WITH ORDINALITY AS t(item, ord);

  -- ── Commit 4: insertar poa_activity_zones a partir de `zonas` de cada
  --    actividad, verificar consistencia final, y marcar la versión
  --    'active'. Mientras eso no exista, cualquier actividad con al menos
  --    una zona debe fallar aquí — y al fallar, revertir TODO lo insertado
  --    hasta este punto (poa_version + poa_activities), no solo lo último.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_activities) AS item
    WHERE jsonb_array_length(item->'zonas') > 0
  ) THEN
    RAISE EXCEPTION 'import_poa_version: inserción de zonas pendiente de implementar (Incremento 5, capa 4, commit 4)';
  END IF;

  RETURN v_version_id;
END;
$$;
