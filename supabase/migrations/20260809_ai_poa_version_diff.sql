-- =============================================================================
-- IA — get_poa_version_diff(): "¿qué cambió entre la versión N y la M del POA?"
--
-- CONTRATO (congelado antes de implementar, con el usuario):
--   Responde ÚNICAMENTE "¿qué cambió?" — nunca "¿qué efecto tuvo?". El
--   impacto en ejecución/facturación es otro eje del dominio y se resuelve
--   combinando este tool con los ya existentes (get_board_summary,
--   get_pending_billable_work), nunca mezclado aquí.
--
--   Granularidad: la misma clave de negocio que usa el importador, "según
--   corresponda" — nunca filas de Excel ni IDs internos:
--     - added / removed / quantity_changed: (activity_key, zona) — porque
--       cantidad_contratada vive en poa_activity_zones, por zona.
--     - price_changed: activity_key solo — porque precio_unitario vive en
--       poa_activities, una vez por actividad por versión (no por zona).
--
--   Precio unitario NO es una anomalía. Se verificó contra los documentos ya
--   congelados antes de escribir esto: poa-domain.md Regla 9 dice
--   textualmente "Cualquier modificación del precio únicamente podrá
--   realizarse mediante la publicación de una nueva versión del POA" — es el
--   mecanismo SANCIONADO para cambiarlo, no una violación. ADR-0003 usa un
--   cambio de precio entre versiones como ejemplo de funcionamiento normal.
--   Se reporta como price_changed, mismo nivel que quantity_changed — nunca
--   con lenguaje de "inconsistencia" o "violación".
--
--   "quantity_changed" exige que la fila (activity_key, zona) exista en AMBAS
--   versiones con cantidad distinta — si una zona desaparece de
--   poa_activity_zones entre versiones, es "removed", no "quantity_changed
--   a 0" (son conceptos distintos: la fila ya no existe vs. existe con otro
--   valor).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_poa_version_diff(
  p_poa_id UUID,
  p_from_version INT,
  p_to_version INT
)
RETURNS TABLE(
  change_type  TEXT,
  activity_key TEXT,
  zone_name    TEXT,
  old_quantity NUMERIC,
  new_quantity NUMERIC,
  old_price    NUMERIC,
  new_price    NUMERIC
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_id UUID;
  v_from_id  UUID;
  v_to_id    UUID;
BEGIN
  SELECT board_id INTO v_board_id FROM public.poa WHERE id = p_poa_id;
  IF v_board_id IS NULL OR get_user_board_role(v_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  IF p_from_version = p_to_version THEN
    RAISE EXCEPTION 'from_version y to_version deben ser distintos.';
  END IF;

  SELECT id INTO v_from_id FROM public.poa_versions WHERE poa_id = p_poa_id AND version_number = p_from_version;
  SELECT id INTO v_to_id   FROM public.poa_versions WHERE poa_id = p_poa_id AND version_number = p_to_version;

  IF v_from_id IS NULL OR v_to_id IS NULL THEN
    RAISE EXCEPTION 'Una o ambas versiones no existen para este POA.';
  END IF;

  RETURN QUERY
  WITH from_azs AS (
    SELECT pa.activity_key, g.title AS zone_name, g.id AS zone_id, paz.cantidad_contratada
    FROM public.poa_activity_zones paz
    JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
    JOIN public.groups g ON g.id = paz.zone_id
    WHERE pa.poa_version_id = v_from_id
  ),
  to_azs AS (
    SELECT pa.activity_key, g.title AS zone_name, g.id AS zone_id, paz.cantidad_contratada
    FROM public.poa_activity_zones paz
    JOIN public.poa_activities pa ON pa.id = paz.poa_activity_id
    JOIN public.groups g ON g.id = paz.zone_id
    WHERE pa.poa_version_id = v_to_id
  )
  SELECT
    CASE
      WHEN f.activity_key IS NULL THEN 'added'
      WHEN t.activity_key IS NULL THEN 'removed'
      ELSE 'quantity_changed'
    END,
    COALESCE(t.activity_key, f.activity_key),
    COALESCE(t.zone_name, f.zone_name),
    f.cantidad_contratada,
    t.cantidad_contratada,
    NULL::NUMERIC,
    NULL::NUMERIC
  FROM from_azs f
  FULL OUTER JOIN to_azs t ON t.activity_key = f.activity_key AND t.zone_id = f.zone_id
  WHERE f.activity_key IS NULL
     OR t.activity_key IS NULL
     OR f.cantidad_contratada IS DISTINCT FROM t.cantidad_contratada

  UNION ALL

  SELECT
    'price_changed',
    f.activity_key,
    NULL,
    NULL::NUMERIC,
    NULL::NUMERIC,
    f.precio_unitario,
    t.precio_unitario
  FROM public.poa_activities f
  JOIN public.poa_activities t ON t.activity_key = f.activity_key
  WHERE f.poa_version_id = v_from_id
    AND t.poa_version_id = v_to_id
    AND f.precio_unitario IS DISTINCT FROM t.precio_unitario;
END;
$$;

COMMENT ON FUNCTION public.get_poa_version_diff(UUID, INT, INT) IS
  'DTO estable para el tool de IA get_poa_version_diff: qué cambió entre dos versiones del POA (actividades agregadas/eliminadas y cambios de cantidad, a nivel activity_key+zona; cambios de precio a nivel activity_key). El precio unitario cambiando entre versiones es el mecanismo normal y sancionado (poa-domain.md Regla 9), no una anomalía — se reporta al mismo nivel que un cambio de cantidad. No incluye impacto en ejecución/facturación — eso es responsabilidad de otros tools.';
