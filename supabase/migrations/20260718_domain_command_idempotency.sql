-- =============================================================================
-- Idempotencia de comandos de dominio (carril 2 del offline)
--
-- CONTRATO: docs/architecture/offline-certification-design.md, sección
-- "Idempotencia" — un comando solo puede producir un efecto una vez; repetir
-- el mismo command_id debe devolver el mismo resultado lógico sin repetir el
-- efecto. Necesario porque un corte de red justo entre la ejecución del RPC
-- y la confirmación de la respuesta no permite al cliente distinguir "nunca
-- llegó" de "llegó pero no vi la confirmación" — sin esto, un reintento de
-- useOfflineSync.replayDomainCommands() duplicaría el efecto.
--
-- Diseño: tabla de comandos ya procesados, chequeada al INICIO de la función
-- (no-op si ya existe) e insertada al FINAL (mismo commit que el efecto real,
-- así que un fallo a mitad de camino revierte ambos o ninguno — nunca deja
-- el comando "medio procesado"). p_command_id es opcional (DEFAULT NULL) para
-- no romper llamadas existentes que no lo envían.
--
-- Alcance de este cambio: solo report_execution, porque es el único comando
-- con productor real en el cliente hoy (useWeeklyPlanMutations.ts). El mismo
-- patrón se extiende a verify_execution/reject_execution cuando esos ganen
-- su propio productor offline — no antes, para no dejar código sin poder
-- verificarse end-to-end.
-- =============================================================================

-- Nunca se consulta directamente desde el cliente (supabase.from()) — solo
-- las funciones SECURITY DEFINER la tocan. RLS deny-by-default explícito
-- (sin políticas) para que quede así aunque alguien lo intente por error.
CREATE TABLE public.processed_domain_commands (
  command_id   UUID PRIMARY KEY,
  command_type TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  processed_by UUID NOT NULL REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.processed_domain_commands ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.processed_domain_commands IS
  'Registro de comandos de dominio ya ejecutados, por command_id (UUID generado en el cliente). Ver docs/architecture/offline-certification-design.md, sección Idempotencia.';

-- ── report_execution (con idempotencia) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.report_execution(p_execution_id UUID, p_command_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_exec  public.weekly_plan_item_executions%ROWTYPE;
  v_board UUID;
BEGIN
  -- Replay idempotente: este comando ya se procesó, devolver éxito sin
  -- repetir el efecto (no releer/revalidar nada más).
  IF p_command_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.processed_domain_commands WHERE command_id = p_command_id
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_exec
  FROM   public.weekly_plan_item_executions
  WHERE  id = p_execution_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ejecución % no encontrada', p_execution_id;
  END IF;

  v_board := public._get_board_id_for_execution(p_execution_id);

  IF NOT public.can_report_execution(v_board, auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso para reportar ejecuciones en este board.';
  END IF;
  -- Leader solo puede reportar sus propias ejecuciones; admin y assistant pueden reportar cualquiera.
  IF v_exec.created_by != auth.uid()
     AND get_user_board_role(v_board, auth.uid()) NOT IN ('admin', 'assistant') THEN
    RAISE EXCEPTION 'Solo el creador de la ejecución puede reportarla (o admin/asistente).';
  END IF;
  IF v_exec.status != 'draft' THEN
    RAISE EXCEPTION 'Solo se puede reportar una ejecución en estado draft. Estado actual: %', v_exec.status;
  END IF;

  UPDATE public.weekly_plan_item_executions
  SET    status     = 'reported',
         updated_by = auth.uid()
  WHERE  id = p_execution_id;

  IF p_command_id IS NOT NULL THEN
    INSERT INTO public.processed_domain_commands (command_id, command_type, entity_id, processed_by)
    VALUES (p_command_id, 'REPORT_EXECUTION', p_execution_id, auth.uid());
  END IF;
END;
$$;
