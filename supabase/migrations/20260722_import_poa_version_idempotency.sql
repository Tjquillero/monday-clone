-- =============================================================================
-- import_poa_version — idempotencia por operación de importación
-- Ref: supabase/migrations/20260721_import_poa_version.sql
--
-- Motivación: un reintento accidental (doble clic, retry de red, doble envío
-- del mismo formulario) no debe crear una poa_version duplicada. Esto es
-- DISTINTO de TC-05 de docs/architecture/poa-excel-import-test-matrix.md
-- (reimportar el mismo Excel, dos operaciones DELIBERADAS distintas, crea
-- v2 y v3 — sin deduplicación por contenido, por Regla 1 de poa-domain.md).
-- Aquí se protege la MISMA operación de importación de crear dos versiones
-- por accidente, no el contenido.
--
-- Mismo patrón ya usado para domain_commands (Incremento 4a,
-- processed_domain_commands + command_id): el llamador genera una vez un
-- UUID por operación; reintentar con el mismo id es un no-op idempotente
-- que devuelve la versión ya creada, no un error ni una fila duplicada.
--
-- NOTA sobre CREATE OR REPLACE: cambiar la firma de una función (agregar
-- p_import_operation_id) crea un OVERLOAD en Postgres, no reemplaza la
-- función anterior — lección ya documentada en este proyecto
-- (20260719_report_execution_overload_fix.sql). Por eso este archivo hace
-- DROP FUNCTION explícito de la firma de 2 argumentos antes de crear la de 3.
-- =============================================================================

ALTER TABLE public.poa_versions
  ADD COLUMN IF NOT EXISTS import_operation_id UUID;

-- Único cuando está presente; NULL no colisiona (versiones creadas sin una
-- clave de idempotencia, ej. datos de prueba sembrados directamente).
CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_versions_import_operation_id
  ON public.poa_versions (import_operation_id)
  WHERE import_operation_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.import_poa_version(UUID, JSONB);

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

  -- Commit 2 en adelante: creación de poa_version (persistiendo
  -- p_import_operation_id), poa_activities, poa_activity_zones dentro de
  -- esta misma función.
  RAISE EXCEPTION 'import_poa_version: pendiente de implementar (Incremento 5, capa 4, commits 2-4)';
END;
$$;
