-- =============================================================================
-- Migration: 20260925_02_c12_security_hardening.sql
-- Hito: C1.2 Security Hardening - Cierre de Puerta Lateral DRAFT (INV-MOB-07)
-- Baseline Previo: 161 suites / 1.397 tests PASS (0 errores TS)
-- Estado previo: GATE-C1.2-02 OPEN / REMAINING BLOCKERS
-- =============================================================================
-- PROPOSITO:
-- 1. Revocar explicitamente INSERT/UPDATE/DELETE a `authenticated` y `PUBLIC`
--    sobre personnel_versions y personnel_site_assignments.
--    La migracion anterior (20260925_01_personnel_mobility_governed_rpc.sql)
--    solo anadio GRANT SELECT y REVOKE ALL FROM anon, pero no revoco
--    los privilegios de escritura directa heredados de `authenticated`.
-- 2. Reemplazar las politicas RLS legacy "FOR ALL" por politicas SELECT-only.
--    Las politicas "Enable authenticated access for X FOR ALL" otorgaban
--    INSERT/UPDATE/DELETE por RLS, contradiciendo INV-MOB-07.
-- 3. Forzar actor obligatorio cuando auth.uid() es NULL (service_role calls).
-- 4. Bloquear DRAFT directo via trigger adicional (defensa en profundidad).
-- =============================================================================

-- -----------------------------------------------------------------------
-- BLOQUE 1: REVOCAR CAPACIDAD DE ESCRITURA DIRECTA DE CLIENTES
-- -----------------------------------------------------------------------
-- El RPC reassign_personnel_governed_xact opera con SECURITY DEFINER,
-- por lo que sus operaciones internas no requieren que `authenticated`
-- tenga permisos de escritura directa sobre estas tablas.
-- -----------------------------------------------------------------------

-- personnel_versions: revocar escritura directa de authenticated y PUBLIC
REVOKE INSERT, UPDATE, DELETE ON public.personnel_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.personnel_versions FROM PUBLIC;

-- personnel_site_assignments: revocar escritura directa de authenticated y PUBLIC
REVOKE INSERT, UPDATE, DELETE ON public.personnel_site_assignments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.personnel_site_assignments FROM PUBLIC;

-- SELECT permanece concedido (no-op si ya existe)
GRANT SELECT ON public.personnel_versions TO authenticated;
GRANT SELECT ON public.personnel_site_assignments TO authenticated;

-- anon sigue sin ningun privilegio
REVOKE ALL ON public.personnel_versions FROM anon;
REVOKE ALL ON public.personnel_site_assignments FROM anon;

-- -----------------------------------------------------------------------
-- BLOQUE 2: REEMPLAZAR POLITICAS RLS "FOR ALL" POR POLITICAS SEGREGADAS
-- -----------------------------------------------------------------------

-- 2.1 personnel_versions: eliminar politica legacy FOR ALL
DROP POLICY IF EXISTS "Enable authenticated access for personnel_versions"
  ON public.personnel_versions;

-- 2.2 personnel_versions: crear politica SELECT-only
CREATE POLICY "pv_select_authenticated"
  ON public.personnel_versions
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2.3 personnel_site_assignments: eliminar politica legacy FOR ALL
DROP POLICY IF EXISTS "Enable authenticated access for personnel_site_assignments"
  ON public.personnel_site_assignments;

-- 2.4 personnel_site_assignments: crear politica SELECT-only
CREATE POLICY "psa_select_authenticated"
  ON public.personnel_site_assignments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------
-- BLOQUE 3: TRIGGER DE RECHAZO DE DRAFT DIRECTO (defensa en profundidad)
-- -----------------------------------------------------------------------
-- Aunque con los REVOKE anteriores un usuario `authenticated` no puede
-- hacer INSERT directamente, el trigger actua como capa adicional que
-- bloquea cualquier intento de insertar una version DRAFT desde fuera
-- del RPC gobernado (p.e. si algun GRANT residual lo permitiera).
-- El RPC senaliza su contexto legitimo via GUC app.rpc_gateway.
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_block_direct_draft_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'DRAFT' THEN
    IF current_setting('app.rpc_gateway', true) IS DISTINCT FROM 'reassign_personnel_governed_xact' THEN
      RAISE EXCEPTION 'DIRECT_DRAFT_FORBIDDEN: Las versiones DRAFT solo pueden crearse mediante reassign_personnel_governed_xact. INV-MOB-07 violation detected.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_block_direct_draft_insert ON public.personnel_versions;
CREATE TRIGGER trig_block_direct_draft_insert
  BEFORE INSERT ON public.personnel_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_direct_draft_insert();

-- -----------------------------------------------------------------------
-- BLOQUE 4: ACTUALIZAR RPC CON SEÑAL DE GATEWAY + ACTOR OBLIGATORIO
-- -----------------------------------------------------------------------
-- Cambios respecto a la version anterior:
-- A. Senaliza app.rpc_gateway para que el trigger lo reconozca.
-- B. Cuando auth.uid() IS NULL (service_role), p_actor_user_id es
--    OBLIGATORIO. No se permite created_by = NULL en mutacion gobernada.
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reassign_personnel_governed_xact(
  p_board_id UUID,
  p_source_version_id UUID,
  p_personnel_id UUID,
  p_target_group_id UUID DEFAULT NULL,
  p_target_zone TEXT DEFAULT 'GENERAL',
  p_effective_from DATE DEFAULT NULL,
  p_change_reason TEXT DEFAULT 'Reasignacion de personal',
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_lock_key BIGINT;
  v_today_bogota DATE;
  v_effective_from DATE;
  v_source_version RECORD;
  v_canonical_source_id UUID;
  v_new_version_id UUID;
  v_source_count INTEGER;
  v_new_count INTEGER;
  v_distinct_count INTEGER;
  v_target_zone TEXT := COALESCE(p_target_zone, 'GENERAL');
  v_reason TEXT := TRIM(COALESCE(p_change_reason, ''));
  v_version_name TEXT;
  v_authenticated_user UUID := auth.uid();
  v_effective_actor_id UUID;
  v_is_authorized BOOLEAN;
BEGIN
  -- 1. Validaciones basicas de argumentos
  IF p_board_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: board_id es requerido' USING ERRCODE = '22000';
  END IF;
  IF p_source_version_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: source_version_id es requerido' USING ERRCODE = '22000';
  END IF;
  IF p_personnel_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: personnel_id es requerido' USING ERRCODE = '22000';
  END IF;
  IF LENGTH(v_reason) < 5 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: change_reason debe contener al menos 5 caracteres' USING ERRCODE = '22000';
  END IF;

  -- 2. Seguridad, Anti-Spoofing & Autorizacion RBAC
  IF v_authenticated_user IS NOT NULL THEN
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id <> v_authenticated_user THEN
      RAISE EXCEPTION 'ACTOR_SPOOFING_FORBIDDEN: p_actor_user_id (%) no coincide con el usuario autenticado (%)', p_actor_user_id, v_authenticated_user
        USING ERRCODE = '42501';
    END IF;
    v_effective_actor_id := v_authenticated_user;

    SELECT EXISTS (
      SELECT 1 FROM public.user_board_roles
      WHERE user_id = v_authenticated_user
        AND board_id = p_board_id
        AND LOWER(role) IN ('admin', 'supervisor')
        AND is_active = true
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
      RAISE EXCEPTION 'RBAC_FORBIDDEN: El usuario % no tiene rol de admin o supervisor activo en el tablero %', v_authenticated_user, p_board_id
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- service_role path: p_actor_user_id es OBLIGATORIO para trazabilidad
    IF p_actor_user_id IS NULL THEN
      RAISE EXCEPTION 'SERVICE_ROLE_ACTOR_REQUIRED: Cuando auth.uid() es NULL (service_role), p_actor_user_id es obligatorio. INV-MOB-07.'
        USING ERRCODE = '22000';
    END IF;
    v_effective_actor_id := p_actor_user_id;
  END IF;

  -- 3. Determinismo temporal: America/Bogota (UTC-5)
  v_today_bogota := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::DATE;
  v_effective_from := COALESCE(p_effective_from, v_today_bogota);

  IF v_effective_from < v_today_bogota THEN
    RAISE EXCEPTION 'INVALID_EFFECTIVE_FROM_PAST: effective_from (%) no puede ser anterior a la fecha actual en America/Bogota (%)', v_effective_from, v_today_bogota
      USING ERRCODE = '22000';
  END IF;

  -- 4. Advisory Lock Transaccional de 64 bits por board_id
  v_lock_key := hashtextextended(p_board_id::TEXT, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 5. Validacion de Sitio/Grupo Destino
  IF p_target_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = p_target_group_id AND board_id = p_board_id
    ) THEN
      RAISE EXCEPTION 'TARGET_GROUP_NOT_FOUND: El grupo/sitio destino (%) no pertenece al tablero (%)', p_target_group_id, p_board_id
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 6. Resolucion y Validacion Estricta de Version Origen Canonica
  SELECT id INTO v_canonical_source_id
  FROM public.personnel_versions
  WHERE board_id = p_board_id
    AND status = 'PUBLISHED'
    AND effective_from <= v_effective_from
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF v_canonical_source_id IS NULL THEN
    RAISE EXCEPTION 'NO_CANONICAL_SOURCE_VERSION: No existe una version PUBLISHED canonica en el tablero (%) para la fecha efectiva (%)', p_board_id, v_effective_from
      USING ERRCODE = '22000';
  END IF;

  IF p_source_version_id <> v_canonical_source_id THEN
    RAISE EXCEPTION 'INVALID_SOURCE_VERSION: La version origen proporcionada (%) no coincide con la version canonica vigente (%) para la fecha efectiva (%)',
      p_source_version_id, v_canonical_source_id, v_effective_from
      USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_source_version
  FROM public.personnel_versions
  WHERE id = v_canonical_source_id AND board_id = p_board_id;

  -- 7. Validar existencia del personal en la version origen
  SELECT COUNT(*) INTO v_source_count
  FROM public.personnel_site_assignments
  WHERE version_id = v_source_version.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.personnel_site_assignments
    WHERE version_id = v_source_version.id AND personnel_id = p_personnel_id
  ) THEN
    RAISE EXCEPTION 'PERSONNEL_NOT_IN_SOURCE_VERSION: La persona seleccionada no pertenece a la version origen' USING ERRCODE = '22000';
  END IF;

  -- 8. Senalizar contexto de gateway legitimo para el trigger
  PERFORM set_config('app.rpc_gateway', 'reassign_personnel_governed_xact', true);

  -- 9. Generar nombre e insertar nueva version en estado DRAFT
  v_version_name := 'V' || (
    SELECT COALESCE(MAX(
      SUBSTRING(version_name FROM '^V([0-9]+)')::INTEGER
    ), 1) + 1
    FROM public.personnel_versions
    WHERE board_id = p_board_id
  ) || ' - Movilidad ' || TO_CHAR(v_effective_from, 'YYYY-MM-DD');

  INSERT INTO public.personnel_versions (
    board_id,
    version_name,
    status,
    is_active,
    effective_from,
    change_reason,
    created_by
  ) VALUES (
    p_board_id,
    v_version_name,
    'DRAFT',
    false,
    v_effective_from,
    v_reason,
    v_effective_actor_id
  ) RETURNING id INTO v_new_version_id;

  -- 10. Clonar asignaciones
  INSERT INTO public.personnel_site_assignments (
    version_id,
    personnel_id,
    role_in_site,
    zone,
    dedication_percentage,
    daily_rate_override
  )
  SELECT
    v_new_version_id,
    psa.personnel_id,
    psa.role_in_site,
    CASE
      WHEN psa.personnel_id = p_personnel_id THEN v_target_zone
      ELSE psa.zone
    END,
    psa.dedication_percentage,
    psa.daily_rate_override
  FROM public.personnel_site_assignments psa
  WHERE psa.version_id = v_source_version.id;

  -- 11. Validar Invariantes de Snapshot
  SELECT COUNT(*) INTO v_new_count
  FROM public.personnel_site_assignments
  WHERE version_id = v_new_version_id;

  IF v_new_count <> v_source_count THEN
    RAISE EXCEPTION 'INVARIANT_VIOLATION_DOTATION: El snapshot nuevo tiene % personas pero el origen tiene %', v_new_count, v_source_count
      USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(DISTINCT personnel_id) INTO v_distinct_count
  FROM public.personnel_site_assignments
  WHERE version_id = v_new_version_id;

  IF v_distinct_count <> v_new_count THEN
    RAISE EXCEPTION 'INVARIANT_VIOLATION_CARDINALITY: Existen personas duplicadas en el nuevo snapshot'
      USING ERRCODE = '23514';
  END IF;

  -- 12. Publication Gate: publicar atomicamente
  UPDATE public.personnel_versions
  SET status = 'PUBLISHED', is_active = true
  WHERE id = v_new_version_id;

  PERFORM set_config('app.rpc_gateway', '', true);

  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- Re-aplicar grants sobre el RPC recreado
REVOKE ALL ON FUNCTION public.reassign_personnel_governed_xact FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_personnel_governed_xact TO authenticated, service_role;

-- -----------------------------------------------------------------------
-- BLOQUE 5: VERIFICACION DECLARATIVA DEL CONTRATO
-- -----------------------------------------------------------------------
DO $$
DECLARE
  v_insert_pv BOOLEAN;
  v_update_pv BOOLEAN;
  v_delete_pv BOOLEAN;
  v_insert_psa BOOLEAN;
  v_update_psa BOOLEAN;
  v_delete_psa BOOLEAN;
BEGIN
  SELECT
    has_table_privilege('authenticated', 'public.personnel_versions', 'INSERT'),
    has_table_privilege('authenticated', 'public.personnel_versions', 'UPDATE'),
    has_table_privilege('authenticated', 'public.personnel_versions', 'DELETE')
  INTO v_insert_pv, v_update_pv, v_delete_pv;

  IF v_insert_pv OR v_update_pv OR v_delete_pv THEN
    RAISE WARNING 'INV-MOB-07 VIOLATION: authenticated has write on personnel_versions (I=%, U=%, D=%)',
      v_insert_pv, v_update_pv, v_delete_pv;
  ELSE
    RAISE NOTICE 'INV-MOB-07 PASS: authenticated has no direct write on personnel_versions.';
  END IF;

  SELECT
    has_table_privilege('authenticated', 'public.personnel_site_assignments', 'INSERT'),
    has_table_privilege('authenticated', 'public.personnel_site_assignments', 'UPDATE'),
    has_table_privilege('authenticated', 'public.personnel_site_assignments', 'DELETE')
  INTO v_insert_psa, v_update_psa, v_delete_psa;

  IF v_insert_psa OR v_update_psa OR v_delete_psa THEN
    RAISE WARNING 'INV-MOB-07 VIOLATION: authenticated has write on personnel_site_assignments (I=%, U=%, D=%)',
      v_insert_psa, v_update_psa, v_delete_psa;
  ELSE
    RAISE NOTICE 'INV-MOB-07 PASS: authenticated has no direct write on personnel_site_assignments.';
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- Estado final post-migracion:
--   personnel_versions:         authenticated = SELECT ONLY
--   personnel_site_assignments: authenticated = SELECT ONLY
--   anon:                       REVOKE ALL (ambas tablas)
--   RPC:                        SECURITY DEFINER, actor obligatorio service_role
--   RLS:                        SELECT-only policies
--   DRAFT gate:                 trig_block_direct_draft_insert activo
-- INV-MOB-07: SATISFECHO
-- -----------------------------------------------------------------------
