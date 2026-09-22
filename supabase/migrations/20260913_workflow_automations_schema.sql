-- Migration: 20260913_workflow_automations_schema.sql
-- Module: Workflow Automation Engine (Mantenix v1.2)
-- Baseline Entrada: 117 suites / 955 tests / TS 0 errores
-- Principios: Inmutabilidad por versiones (UUID propio por versión), anti-tampering trigger, idempotencia y RLS seguro.

CREATE TABLE IF NOT EXISTS public.automation_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  parent_definition_id UUID REFERENCES public.automation_definitions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED')),
  trigger_type TEXT NOT NULL,
  condition_group JSONB NOT NULL DEFAULT '{"operator":"AND","conditions":[]}'::jsonb,
  action JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_definition_id UUID NOT NULL REFERENCES public.automation_definitions(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('PENDING', 'EXECUTING', 'SUCCESS', 'FAILED', 'SKIPPED')),
  gateway_idempotency_key TEXT NOT NULL UNIQUE,
  causality_depth INTEGER NOT NULL DEFAULT 0,
  evaluated_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  gateway_result_snapshot JSONB,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indices de soporte
CREATE INDEX IF NOT EXISTS idx_auto_def_board_status ON public.automation_definitions(board_id, status);
CREATE INDEX IF NOT EXISTS idx_auto_exec_def_status ON public.automation_executions(automation_definition_id, execution_status);
CREATE INDEX IF NOT EXISTS idx_auto_exec_event_id ON public.automation_executions(event_id);
CREATE INDEX IF NOT EXISTS idx_auto_exec_idempotency ON public.automation_executions(gateway_idempotency_key);

-- RLS y Revocación de acceso directo
ALTER TABLE public.automation_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.automation_definitions FROM anon, authenticated;
REVOKE ALL ON public.automation_executions FROM anon, authenticated;

-- Políticas de Lectura Restringidas a Miembros Activos del Tablero
CREATE POLICY rls_automation_definitions_select ON public.automation_definitions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_board_roles ubr
      WHERE ubr.board_id = automation_definitions.board_id
        AND ubr.user_id = auth.uid()
        AND ubr.is_active = true
    )
  );

CREATE POLICY rls_automation_executions_select ON public.automation_executions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_board_roles ubr
      WHERE ubr.board_id = automation_executions.board_id
        AND ubr.user_id = auth.uid()
        AND ubr.is_active = true
    )
  );

-- Trigger de Inmutabilidad Semántica y Máquina de Estados (WF-C04)
CREATE OR REPLACE FUNCTION public.fn_protect_automation_definition()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el registro ya estaba ARCHIVED, no se permite ninguna modificación
  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'ARCHIVED automation definitions are strictly immutable (TAMPERING_FORBIDDEN)';
  END IF;

  -- Prohibir volver a DRAFT desde cualquier estado activo o archivado
  IF OLD.status IN ('ACTIVE', 'DISABLED') AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot revert published automation definition to DRAFT. Create a new version instead (TAMPERING_FORBIDDEN)';
  END IF;

  -- Si era ACTIVE o DISABLED, la lógica y versión son inmutables; solo se permite cambiar status a DISABLED o ARCHIVED
  IF OLD.status IN ('ACTIVE', 'DISABLED') THEN
    IF OLD.trigger_type != NEW.trigger_type
       OR OLD.condition_group != NEW.condition_group
       OR OLD.action != NEW.action
       OR OLD.version != NEW.version
       OR OLD.board_id != NEW.board_id THEN
      RAISE EXCEPTION 'Published automation definition logic is immutable. Create a new version (TAMPERING_FORBIDDEN)';
    END IF;
  END IF;

  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_automation_definition ON public.automation_definitions;
CREATE TRIGGER trg_protect_automation_definition
BEFORE UPDATE ON public.automation_definitions
FOR EACH ROW
EXECUTE FUNCTION public.fn_protect_automation_definition();
