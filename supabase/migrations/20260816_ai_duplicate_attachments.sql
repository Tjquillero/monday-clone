-- =============================================================================
-- IA — get_duplicate_attachments(): duplicados EXACTOS de evidencia, v2.4
-- de Fase 5. Determinístico, SIN Gemini — compara file_hash (SHA-256 del
-- contenido binario, calculado en el cliente al subir). "¿Este archivo ya
-- existe?" se responde en SQL, no con juicio visual. La comparación de
-- "escenas parecidas" (fotos distintas pero similares) es un incremento
-- aparte (v2.4b) que sí necesitaría Gemini Vision.
--
-- Alcance: por board completo, no solo una ejecución — detecta tanto
-- duplicados dentro de la misma jornada (la misma foto subida dos veces
-- por error) como el mismo archivo reusado entre jornadas distintas
-- (señal más seria: reciclar evidencia de una certificación anterior).
--
-- Devuelve una fila por (archivo, ejecución) para cada file_hash que
-- aparece 2+ veces en el board — nunca un archivo aislado sin ningún
-- duplicado real. Fotos con file_hash NULL (subidas antes de este cambio)
-- se excluyen: no hay forma de saber si son duplicados sin el hash.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_duplicate_attachments(p_board_id UUID)
RETURNS TABLE(
  file_hash      TEXT,
  execution_id   UUID,
  activity_key   TEXT,
  activity_name  TEXT,
  execution_date DATE,
  file_name      TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  RETURN QUERY
  WITH board_attachments AS (
    SELECT
      ea.file_hash,
      ea.execution_id,
      i.activity_key,
      e.execution_date,
      ea.file_name,
      ea.created_at
    FROM public.execution_attachments ea
    JOIN public.weekly_plan_item_executions e ON e.id = ea.execution_id
    JOIN public.weekly_plan_items i ON i.id = e.plan_item_id
    JOIN public.weekly_plans wp ON wp.id = i.plan_id
    WHERE wp.board_id = p_board_id
      AND ea.file_hash IS NOT NULL
  ),
  dup_hashes AS (
    SELECT ba.file_hash
    FROM board_attachments ba
    GROUP BY ba.file_hash
    HAVING COUNT(*) > 1
  )
  SELECT
    ba.file_hash,
    ba.execution_id,
    ba.activity_key,
    COALESCE(bas.name, ba.activity_key),
    ba.execution_date,
    ba.file_name,
    ba.created_at
  FROM board_attachments ba
  JOIN dup_hashes dh ON dh.file_hash = ba.file_hash
  LEFT JOIN public.board_activity_standards bas
    ON  bas.board_id     = p_board_id
    AND bas.activity_key = ba.activity_key
    AND bas.effective_to IS NULL
  ORDER BY ba.file_hash, ba.execution_date, ba.created_at
  LIMIT 500;
END;
$$;

COMMENT ON FUNCTION public.get_duplicate_attachments(UUID) IS
  'DTO estable para el tool de IA get_duplicate_attachments: fotos de evidencia con el mismo file_hash (duplicado exacto, byte a byte) en más de una fila del board — dentro de la misma ejecución o entre ejecuciones distintas. Determinístico, sin Gemini. Fotos sin file_hash (históricas) se excluyen.';
