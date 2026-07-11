-- =============================================================================
-- import_poa_version — Commit 1/4: firma de la función (vacía) + permisos + RLS
-- Ref: docs/architecture/poa-excel-import-design.md
--
-- Responsabilidad única de esta función: recibir un resultado de validación
-- YA aprobado por las capas 1-3 (src/lib/poaImport/) y persistirlo de forma
-- atómica. No reinterpreta el Excel, no vuelve a validar activity_key, zonas,
-- frecuencias ni cantidades — esa inteligencia vive en TypeScript, donde es
-- más fácil probar y evolucionar. Esta capa es deliberadamente "tonta".
--
-- Precondiciones que el llamador garantiza (no se re-verifican aquí):
--   - ValidationResult.valid === true (sin errores bloqueantes).
--   - Cada zona de cada actividad ya trae un group_id resuelto vía
--     poa_zone_mappings (ADR-0004) — nunca un excel_zone_name sin resolver.
--   - Las actividades en `noContratadas` ya fueron excluidas del payload.
--   - Las actividades con frecuencia_pendiente_regla_negocio NUNCA llegan
--     aquí — si alguna llegara, sería un error de integración del llamador,
--     no algo que esta función deba decidir.
--
-- Esta función pasa a ser la ÚNICA forma de escribir en poa_versions,
-- poa_activities y poa_activity_zones — las políticas RLS de esas tres
-- tablas se reducen a solo lectura (ver Sección 2). Ni siquiera un admin
-- puede insertar directamente desde el cliente.
--
-- Commits siguientes (misma firma, sin cambiarla):
--   Commit 2 — crear poa_version.
--   Commit 3 — insertar poa_activities, con rollback si algo falla.
--   Commit 4 — insertar poa_activity_zones + verificación de consistencia final.
-- =============================================================================

-- =============================================================================
-- 1. can_manage_poa — mismo patrón que can_manage_weekly_plan /
--    can_report_execution (20260709_weekly_plans_nucleus.sql).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_poa(p_board_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT get_user_board_role(p_board_id, p_user_id) = 'admin'
$$;

-- =============================================================================
-- 2. RLS — poa_versions, poa_activities, poa_activity_zones pasan a ser
--    solo lectura para el cliente. Las políticas "FOR ALL" de
--    20260714_poa_domain_schema.sql se reemplazan por "FOR SELECT"; sin
--    ninguna política de escritura, RLS deniega INSERT/UPDATE/DELETE por
--    defecto para todos los roles, incluido admin. Verificado que ningún
--    código del cliente hace hoy `.from('poa_versions'|'poa_activities'|
--    'poa_activity_zones').insert/update/delete(...)` — solo lectura vía
--    usePoaActivities.ts.
-- =============================================================================

DROP POLICY IF EXISTS "Solo admin gestiona versiones del POA" ON public.poa_versions;
DROP POLICY IF EXISTS "Solo admin gestiona actividades del POA" ON public.poa_activities;
DROP POLICY IF EXISTS "Solo admin gestiona coberturas por zona del POA" ON public.poa_activity_zones;

-- =============================================================================
-- 3. import_poa_version — firma definitiva, cuerpo todavía no implementado.
--
-- p_activities: array JSONB, un elemento por actividad validada:
--   {
--     "activity_key": "1.01",
--     "precio_unitario": 1412.8795648795647,
--     "frecuencia": 1,
--     "zonas": [ { "group_id": "uuid...", "cantidad_contratada": 7887 }, ... ]
--   }
-- Mapea 1:1 a ValidatedActivity[] de src/lib/poaImport/types.ts (camelCase
-- en TypeScript, snake_case en el JSON — mismo criterio que
-- replace_weekly_plan_items).
--
-- Devuelve el id de la poa_version creada.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_poa_version(
  p_poa_id     UUID,
  p_activities JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_poa public.poa%ROWTYPE;
BEGIN
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

  -- Commit 2 en adelante: creación de poa_version, poa_activities,
  -- poa_activity_zones dentro de esta misma función (una función de Postgres
  -- ya corre como una única transacción implícita — cualquier RAISE EXCEPTION
  -- revierte todo lo insertado hasta ese punto).
  RAISE EXCEPTION 'import_poa_version: pendiente de implementar (Incremento 5, capa 4, commits 2-4)';
END;
$$;
