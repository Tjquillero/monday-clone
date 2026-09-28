-- =============================================================================
-- Migration: 20260925_01_personnel_mobility_governed_rpc.sql
-- Hito: Movilidad Gobernada de Personal y Versionado Temporal (ADR-C1.2C)
-- Baseline Previo: 161 suites / 1.394 tests PASS (0 errores TS)
-- Incremento C1.2: +3 tests (161 suites / 1.397 tests) | 1 Migración DDL/RPC
-- =============================================================================

-- 1. Añadir columnas de ciclo de vida y auditoría a personnel_versions
ALTER TABLE public.personnel_versions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLISHED'
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));

ALTER TABLE public.personnel_versions
  ADD COLUMN IF NOT EXISTS change_reason TEXT NULL;

ALTER TABLE public.personnel_versions
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill seguro para versiones existentes
UPDATE public.personnel_versions
SET status = 'PUBLISHED'
WHERE status IS NULL;

-- 3. Restricción física de unicidad temporal por tablero
CREATE UNIQUE INDEX IF NOT EXISTS uq_personnel_version_board_effective_published
ON public.personnel_versions (board_id, effective_from)
WHERE status = 'PUBLISHED';

-- 4. Triggers de protección de inmutabilidad y gobernanza de ciclo de vida

-- 4.1 Trigger en personnel_versions
CREATE OR REPLACE FUNCTION public.fn_block_published_personnel_version_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_today_bogota DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::DATE;
BEGIN
  -- Bloquear eliminación física de versiones publicadas o archivadas
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'CANNOT_DELETE_VERSION: Las versiones publicadas o archivadas no pueden ser eliminadas físicamente.'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Bloquear cualquier mutación sobre versiones ARCHIVED
    IF OLD.status = 'ARCHIVED' THEN
      RAISE EXCEPTION 'CANNOT_MUTATE_ARCHIVED_VERSION: Las versiones archivadas son estrictamente inmutables.'
        USING ERRCODE = '23514';
    END IF;

    -- Si la versión era PUBLISHED:
    IF OLD.status = 'PUBLISHED' THEN
      -- Si es histórica o vigente hoy (effective_from <= hoy en Bogotá), STRICTLY IMMUTABLE (0 cambios en ningún campo)
      IF OLD.effective_from <= v_today_bogota THEN
        IF NEW.* IS DISTINCT FROM OLD.* THEN
          RAISE EXCEPTION 'CANNOT_MUTATE_HISTORICAL_PUBLISHED_VERSION: Las versiones publicadas vigentes o históricas son estrictamente inmutables.'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        -- Si es una versión futura (effective_from > hoy en Bogotá):
        -- Solo se permite transicionar a ARCHIVED manteniendo intactos los demás atributos estructurales
        IF NEW.status = 'ARCHIVED' THEN
          IF NEW.id <> OLD.id
             OR NEW.board_id <> OLD.board_id
             OR NEW.effective_from <> OLD.effective_from
             OR NEW.version_name <> OLD.version_name THEN
            RAISE EXCEPTION 'CANNOT_ALTER_STRUCTURAL_FIELDS_ON_ARCHIVE: La revocación a ARCHIVED solo permite alterar el status.'
              USING ERRCODE = '23514';
          END IF;
        ELSE
          -- Si no es transición a ARCHIVED, bloquear cualquier modificación arbitraria
          IF NEW.* IS DISTINCT FROM OLD.* THEN
            RAISE EXCEPTION 'CANNOT_MUTATE_FUTURE_PUBLISHED_VERSION: Las versiones futuras publicadas solo pueden transicionar a ARCHIVED o permanecer inmutables.'
              USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_block_published_personnel_version_mutation ON public.personnel_versions;
CREATE TRIGGER trig_block_published_personnel_version_mutation
  BEFORE UPDATE OR DELETE ON public.personnel_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_published_personnel_version_mutation();

-- 4.2 Trigger en personnel_site_assignments
CREATE OR REPLACE FUNCTION public.fn_block_published_personnel_assignment_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_version_status TEXT;
  v_target_version_id UUID;
BEGIN
  v_target_version_id := COALESCE(NEW.version_id, OLD.version_id);

  SELECT status INTO v_version_status
  FROM public.personnel_versions
  WHERE id = v_target_version_id;

  IF v_version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'CANNOT_MUTATE_ASSIGNMENTS_OF_PUBLISHED_VERSION: Las asignaciones de una versión publicada son inmutables. Use reassign_personnel_governed_xact.'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_block_published_personnel_assignment_mutation ON public.personnel_site_assignments;
CREATE TRIGGER trig_block_published_personnel_assignment_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.personnel_site_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_block_published_personnel_assignment_mutation();

-- 5. RPC Transaccional Gobernada de Reasignación de Personal con 64-bit Advisory Lock & RBAC
CREATE OR REPLACE FUNCTION public.reassign_personnel_governed_xact(
  p_board_id UUID,
  p_source_version_id UUID,
  p_personnel_id UUID,
  p_target_group_id UUID DEFAULT NULL,
  p_target_zone TEXT DEFAULT 'GENERAL',
  p_effective_from DATE DEFAULT NULL,
  p_change_reason TEXT DEFAULT 'Reasignación de personal',
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
  -- 1. Validaciones básicas de argumentos
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

  -- 2. Seguridad, Anti-Spoofing & Autorización RBAC
  IF v_authenticated_user IS NOT NULL THEN
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id <> v_authenticated_user THEN
      RAISE EXCEPTION 'ACTOR_SPOOFING_FORBIDDEN: p_actor_user_id (%) no coincide con el usuario autenticado (%)', p_actor_user_id, v_authenticated_user
        USING ERRCODE = '42501';
    END IF;
    v_effective_actor_id := v_authenticated_user;

    -- Validación RBAC sobre user_board_roles
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
    v_effective_actor_id := p_actor_user_id;
  END IF;

  -- 3. Determinismo temporal: America/Bogota (UTC-5)
  v_today_bogota := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::DATE;
  v_effective_from := COALESCE(p_effective_from, v_today_bogota);

  IF v_effective_from < v_today_bogota THEN
    RAISE EXCEPTION 'INVALID_EFFECTIVE_FROM_PAST: effective_from (%) no puede ser anterior a la fecha actual en America/Bogota (%)', v_effective_from, v_today_bogota
      USING ERRCODE = '22000';
  END IF;

  -- 4. Advisory Lock Transaccional de 64 bits (int8 / bigint) por board_id
  v_lock_key := hashtextextended(p_board_id::TEXT, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 5. Validación de Sitio/Grupo Destino (si se suministra p_target_group_id)
  IF p_target_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.groups
      WHERE id = p_target_group_id AND board_id = p_board_id
    ) THEN
      RAISE EXCEPTION 'TARGET_GROUP_NOT_FOUND: El grupo/sitio destino (%) no pertenece al tablero (%)', p_target_group_id, p_board_id
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 6. Resolución y Validación Estricta de Versión Origen Canónica (Sin Fallback Silencioso)
  SELECT id INTO v_canonical_source_id
  FROM public.personnel_versions
  WHERE board_id = p_board_id
    AND status = 'PUBLISHED'
    AND effective_from <= v_effective_from
  ORDER BY effective_from DESC, created_at DESC
  LIMIT 1;

  IF v_canonical_source_id IS NULL THEN
    RAISE EXCEPTION 'NO_CANONICAL_SOURCE_VERSION: No existe una versión PUBLISHED canónica en el tablero (%) para la fecha efectiva (%)', p_board_id, v_effective_from
      USING ERRCODE = '22000';
  END IF;

  IF p_source_version_id <> v_canonical_source_id THEN
    RAISE EXCEPTION 'INVALID_SOURCE_VERSION: La versión origen proporcionada (%) no coincide con la versión canónica vigente (%) para la fecha efectiva (%)',
      p_source_version_id, v_canonical_source_id, v_effective_from
      USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_source_version
  FROM public.personnel_versions
  WHERE id = v_canonical_source_id AND board_id = p_board_id;

  -- 7. Validar existencia del personal en la versión origen
  SELECT COUNT(*) INTO v_source_count
  FROM public.personnel_site_assignments
  WHERE version_id = v_source_version.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.personnel_site_assignments
    WHERE version_id = v_source_version.id AND personnel_id = p_personnel_id
  ) THEN
    RAISE EXCEPTION 'PERSONNEL_NOT_IN_SOURCE_VERSION: La persona seleccionada no pertenece a la versión origen' USING ERRCODE = '22000';
  END IF;

  -- 8. Generar nombre secuencial e insertar nueva versión en estado DRAFT
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

  -- 9. Clonar asignaciones aplicando la reasignación de zona/sector en la versión DRAFT
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

  -- 10. Validar Invariantes de Snapshot
  -- INV-MOB-01: Conservación de plantilla N(Vn+1) = N(Vn)
  SELECT COUNT(*) INTO v_new_count
  FROM public.personnel_site_assignments
  WHERE version_id = v_new_version_id;

  IF v_new_count <> v_source_count THEN
    RAISE EXCEPTION 'INVARIANT_VIOLATION_DOTATION: El snapshot nuevo tiene % personas pero el origen tiene %', v_new_count, v_source_count
      USING ERRCODE = '23514';
  END IF;

  -- INV-MOB-02: Cardinalidad 1:1 estricta
  SELECT COUNT(DISTINCT personnel_id) INTO v_distinct_count
  FROM public.personnel_site_assignments
  WHERE version_id = v_new_version_id;

  IF v_distinct_count <> v_new_count THEN
    RAISE EXCEPTION 'INVARIANT_VIOLATION_CARDINALITY: Existen personas duplicadas en el nuevo snapshot'
      USING ERRCODE = '23514';
  END IF;

  -- 11. Publication Gate: Sellar y publicar atómicamente la nueva versión
  UPDATE public.personnel_versions
  SET status = 'PUBLISHED', is_active = true
  WHERE id = v_new_version_id;

  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- 6. Privilegios y Gobernanza de Acceso (Principio de Menor Privilegio)
REVOKE ALL ON FUNCTION public.reassign_personnel_governed_xact FROM anon;
GRANT EXECUTE ON FUNCTION public.reassign_personnel_governed_xact TO authenticated, service_role;

REVOKE ALL ON public.personnel_versions FROM anon;
GRANT SELECT ON public.personnel_versions TO authenticated;

REVOKE ALL ON public.personnel_site_assignments FROM anon;
GRANT SELECT ON public.personnel_site_assignments TO authenticated;
