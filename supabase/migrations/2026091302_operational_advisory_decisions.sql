-- =============================================================================
-- MANTENIX
-- Decision Governance & Outcome Evaluation v1 — Persistencia SoT & RPC
-- Fecha: 2026-09-13
-- =============================================================================

-- 1. Tabla SoT Durable: operational_advisory_decisions (Hecho Histórico Humano)
CREATE TABLE IF NOT EXISTS public.operational_advisory_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_mutation_id text NOT NULL UNIQUE,
  recommendation_id text NOT NULL,
  recommendation_key text NOT NULL,
  decision_sequence_number integer NOT NULL,
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL,
  decision_status text NOT NULL,
  decision_reason text NULL,
  postponed_until_iso timestamptz NULL,
  decision_timestamp timestamptz NOT NULL DEFAULT now(),
  recommendation_snapshot jsonb NOT NULL,
  action_status text NOT NULL DEFAULT 'PENDING_EXECUTION',
  execution_snapshot jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rec_sequence UNIQUE (recommendation_id, decision_sequence_number),
  CONSTRAINT chk_decision_status CHECK (decision_status IN ('ACCEPTED', 'REJECTED', 'POSTPONED')),
  CONSTRAINT chk_action_status CHECK (action_status IN ('PENDING_EXECUTION', 'EXECUTED', 'EXECUTION_FAILED', 'NOT_APPLICABLE'))
);

-- 2. Índices de Desempeño y Auditoría
CREATE INDEX IF NOT EXISTS idx_oad_board_id ON public.operational_advisory_decisions(board_id);
CREATE INDEX IF NOT EXISTS idx_oad_recommendation_id ON public.operational_advisory_decisions(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_oad_decision_timestamp ON public.operational_advisory_decisions(decision_timestamp);

-- 3. Habilitar RLS y Políticas Estrictas
ALTER TABLE public.operational_advisory_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oad_select_policy ON public.operational_advisory_decisions;
CREATE POLICY oad_select_policy ON public.operational_advisory_decisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_board_roles ubr
      WHERE ubr.user_id = auth.uid()
        AND ubr.board_id = operational_advisory_decisions.board_id
        AND ubr.is_active = true
    )
  );

-- 4. Inmutabilidad Física y Restricción de Privilegios (GOV-01, GOV-02)
REVOKE ALL ON public.operational_advisory_decisions FROM anon, authenticated;
GRANT SELECT ON public.operational_advisory_decisions TO authenticated;

-- Trigger para bloquear cualquier UPDATE sobre campos históricos o DELETE
CREATE OR REPLACE FUNCTION public.prevent_decision_record_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAMPERING_FORBIDDEN: Los registros de DecisionRecord son hechos históricos inmutables y no pueden eliminarse.';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Solo se permite la actualización de action_status y execution_snapshot por el servicio de gateway
    IF OLD.id != NEW.id
       OR OLD.decision_mutation_id != NEW.decision_mutation_id
       OR OLD.recommendation_id != NEW.recommendation_id
       OR OLD.recommendation_key != NEW.recommendation_key
       OR OLD.decision_sequence_number != NEW.decision_sequence_number
       OR OLD.board_id != NEW.board_id
       OR OLD.actor_user_id != NEW.actor_user_id
       OR OLD.actor_role != NEW.actor_role
       OR OLD.decision_status != NEW.decision_status
       OR OLD.decision_timestamp != NEW.decision_timestamp
       OR OLD.recommendation_snapshot != NEW.recommendation_snapshot THEN
      RAISE EXCEPTION 'TAMPERING_FORBIDDEN: Los campos históricos de DecisionRecord son inmutables.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_decision_record_tampering ON public.operational_advisory_decisions;
CREATE TRIGGER trg_prevent_decision_record_tampering
BEFORE UPDATE OR DELETE ON public.operational_advisory_decisions
FOR EACH ROW EXECUTE FUNCTION public.prevent_decision_record_tampering();

-- 5. RPC Transaccional Segura: record_advisory_decision (GOV-02, GOV-03)
CREATE OR REPLACE FUNCTION public.record_advisory_decision(
  p_decision_mutation_id text,
  p_recommendation_id text,
  p_recommendation_key text,
  p_board_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_decision_status text,
  p_decision_reason text,
  p_postponed_until_iso timestamptz,
  p_recommendation_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing record;
  v_last_decision record;
  v_next_seq integer;
  v_inserted record;
  v_caller_authorized boolean;
BEGIN
  -- 1. Verificación de Seguridad y Autorización RBAC (GOV-02)
  IF auth.uid() IS NULL OR auth.uid() != p_actor_user_id THEN
    RAISE EXCEPTION 'AUTH_UNAUTHORIZED: El actor no coincide con la sesión autenticada.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_board_roles
    WHERE user_id = p_actor_user_id
      AND board_id = p_board_id
      AND LOWER(role) = LOWER(p_actor_role)
      AND is_active = true
  ) INTO v_caller_authorized;

  IF NOT v_caller_authorized THEN
    RAISE EXCEPTION 'RBAC_FORBIDDEN: El usuario % no tiene el rol % activo en el board %.', p_actor_user_id, p_actor_role, p_board_id;
  END IF;

  -- 2. Idempotencia Física: Si el mutationId ya existe, retornar registro existente
  SELECT * INTO v_existing 
  FROM public.operational_advisory_decisions 
  WHERE decision_mutation_id = p_decision_mutation_id;
  
  IF FOUND THEN
    RETURN jsonb_build_object(
      'decisionRecord', row_to_json(v_existing),
      'isIdempotentReplay', true
    );
  END IF;

  -- 3. Bloqueo Transaccional Atómico sobre la Recomendación (pg_advisory_xact_lock)
  PERFORM pg_advisory_xact_lock(hashtext(p_recommendation_id));

  -- 4. Validar Último Estado de la Recomendación
  SELECT * INTO v_last_decision
  FROM public.operational_advisory_decisions
  WHERE recommendation_id = p_recommendation_id
  ORDER BY decision_sequence_number DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_last_decision.decision_status = 'ACCEPTED' THEN
      RAISE EXCEPTION 'CANNOT_MUTATE_ACCEPTED_RECOMMENDATION: La recomendación ya fue ACEPTADA (seq %).', v_last_decision.decision_sequence_number;
    ELSIF v_last_decision.decision_status = 'REJECTED' THEN
      RAISE EXCEPTION 'CANNOT_MUTATE_REJECTED_RECOMMENDATION: La recomendación fue RECHAZADA terminalmente (seq %).', v_last_decision.decision_sequence_number;
    END IF;
    v_next_seq := v_last_decision.decision_sequence_number + 1;
  ELSE
    v_next_seq := 1;
  END IF;

  -- 5. Inserción Atómica del Hecho Histórico con captura de colisión concurrente (GOV-03)
  BEGIN
    INSERT INTO public.operational_advisory_decisions (
      decision_mutation_id,
      recommendation_id,
      recommendation_key,
      decision_sequence_number,
      board_id,
      actor_user_id,
      actor_role,
      decision_status,
      decision_reason,
      postponed_until_iso,
      recommendation_snapshot,
      action_status
    ) VALUES (
      p_decision_mutation_id,
      p_recommendation_id,
      p_recommendation_key,
      v_next_seq,
      p_board_id,
      p_actor_user_id,
      p_actor_role,
      p_decision_status,
      p_decision_reason,
      p_postponed_until_iso,
      p_recommendation_snapshot,
      CASE 
        WHEN p_decision_status = 'ACCEPTED' THEN 'PENDING_EXECUTION'
        ELSE 'NOT_APPLICABLE'
      END
    ) RETURNING * INTO v_inserted;

    RETURN jsonb_build_object(
      'decisionRecord', row_to_json(v_inserted),
      'isIdempotentReplay', false
    );
  EXCEPTION WHEN unique_violation THEN
    -- Si ocurrió una carrera concurrente con el mismo decision_mutation_id
    SELECT * INTO v_existing 
    FROM public.operational_advisory_decisions 
    WHERE decision_mutation_id = p_decision_mutation_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'decisionRecord', row_to_json(v_existing),
        'isIdempotentReplay', true
      );
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_advisory_decision TO authenticated;
