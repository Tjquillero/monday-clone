-- Migration: 20260913_workflow_outbox_durable_schema.sql
-- Module: WF-C08 Transactional Outbox & Durable Recovery (Mantenix v1.1)
-- Baseline Entrada: 120 suites / 980 tests / TS 0 errores
-- Principios: ON DELETE RESTRICT (WF-C08-INV-04), CAS estricto contra stale workers, proyección tipada de auditoría y privilegios service_role.

CREATE TABLE IF NOT EXISTS public.domain_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_mutation_id TEXT NOT NULL,
  actor JSONB NOT NULL DEFAULT '{"actorType":"SYSTEM"}'::jsonb,
  causality_depth INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'PROCESSED', 'DEAD_LETTER')),
  claim_token UUID,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indices de alto rendimiento para worker de despacho y recuperación
CREATE INDEX IF NOT EXISTS idx_outbox_worker_claim ON public.domain_event_outbox(status, lease_expires_at, created_at)
  WHERE status IN ('PENDING', 'CLAIMED');
CREATE INDEX IF NOT EXISTS idx_outbox_board_audit ON public.domain_event_outbox(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_event_id ON public.domain_event_outbox(event_id);

-- RLS y Revocación Total de Acceso Directo (WF-C08-G03)
ALTER TABLE public.domain_event_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.domain_event_outbox FROM anon, authenticated;

-- Tipo Canónico de Proyección de Auditoría (WF-C08-G09)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_audit_projection') THEN
    CREATE TYPE public.outbox_audit_projection AS (
      event_id TEXT,
      event_type TEXT,
      board_id UUID,
      entity_type TEXT,
      entity_id TEXT,
      status TEXT,
      attempt_count INTEGER,
      last_error_message TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    );
  END IF;
END $$;

-- 1. RPC: claim_outbox_batch (CAS con Token Individual)
CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
  p_worker_id TEXT,
  p_batch_size INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  event_id TEXT,
  event_type TEXT,
  board_id UUID,
  entity_type TEXT,
  entity_id TEXT,
  source_mutation_id TEXT,
  actor JSONB,
  causality_depth INTEGER,
  payload JSONB,
  claim_token UUID,
  attempt_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH available_events AS (
    SELECT o.id
    FROM public.domain_event_outbox o
    WHERE o.status = 'PENDING'
       OR (o.status = 'CLAIMED' AND o.lease_expires_at < timezone('utc'::text, now()) AND o.attempt_count < 5)
    ORDER BY o.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.domain_event_outbox u
  SET 
    status = 'CLAIMED',
    claim_token = gen_random_uuid(),
    claimed_by = p_worker_id,
    claimed_at = timezone('utc'::text, now()),
    lease_expires_at = timezone('utc'::text, now()) + (p_lease_seconds || ' seconds')::INTERVAL,
    attempt_count = u.attempt_count + 1,
    updated_at = timezone('utc'::text, now())
  FROM available_events
  WHERE u.id = available_events.id
  RETURNING 
    u.id, u.event_id, u.event_type, u.board_id, u.entity_type, u.entity_id,
    u.source_mutation_id, u.actor, u.causality_depth, u.payload, u.claim_token, u.attempt_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- 2. RPC: complete_outbox_event (Completion Guard Simétrico con CAS Estricto y Limpieza de Token)
CREATE OR REPLACE FUNCTION public.complete_outbox_event(
  p_event_id UUID,
  p_claim_token UUID,
  p_target_status TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  IF p_target_status NOT IN ('PROCESSED', 'PENDING', 'DEAD_LETTER') THEN
    RAISE EXCEPTION 'Invalid target status: %', p_target_status;
  END IF;

  UPDATE public.domain_event_outbox
  SET 
    status = p_target_status,
    claim_token = NULL,
    claimed_by = NULL,
    claimed_at = NULL,
    lease_expires_at = NULL,
    last_error_message = p_error_message,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_event_id 
    AND status = 'CLAIMED'
    AND claim_token = p_claim_token
    AND lease_expires_at > timezone('utc'::text, now());

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- 3. RPC: get_board_outbox_audit_log (Auditoría Protegida por RBAC sobre Proyección Tipada)
CREATE OR REPLACE FUNCTION public.get_board_outbox_audit_log(
  p_board_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF public.outbox_audit_projection AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_board_roles ubr
    WHERE ubr.board_id = p_board_id
      AND ubr.user_id = auth.uid()
      AND ubr.is_active = true
      AND LOWER(ubr.role) IN ('admin', 'coordinator', 'supervisor')
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Cannot audit outbox for board %', p_board_id;
  END IF;

  RETURN QUERY
  SELECT 
    o.event_id,
    o.event_type,
    o.board_id,
    o.entity_type,
    o.entity_id,
    o.status,
    o.attempt_count,
    o.last_error_message,
    o.created_at,
    o.updated_at
  FROM public.domain_event_outbox o
  WHERE o.board_id = p_board_id
  ORDER BY o.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- 4. RPC: purge_processed_outbox_events (Purga Restringida a service_role desde updated_at)
CREATE OR REPLACE FUNCTION public.purge_processed_outbox_events(
  p_older_than_days INTEGER DEFAULT 14,
  p_batch_size INTEGER DEFAULT 500
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted_rows AS (
    DELETE FROM public.domain_event_outbox
    WHERE id IN (
      SELECT id FROM public.domain_event_outbox
      WHERE status = 'PROCESSED'
        AND updated_at < timezone('utc'::text, now()) - (p_older_than_days || ' days')::INTERVAL
      ORDER BY updated_at ASC
      LIMIT p_batch_size
    )
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_deleted FROM deleted_rows;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- 5. RPC: requeue_dead_letter_event (Reencolamiento Administrativo)
CREATE OR REPLACE FUNCTION public.requeue_dead_letter_event(
  p_event_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  UPDATE public.domain_event_outbox
  SET 
    status = 'PENDING',
    claim_token = NULL,
    claimed_by = NULL,
    claimed_at = NULL,
    lease_expires_at = NULL,
    attempt_count = 0,
    last_error_message = '[REQUEUED_BY_ADMIN] ' || coalesce(last_error_message, ''),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_event_id AND status = 'DEAD_LETTER';

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;

-- Fronteras Explícitas de Ejecución y Privilegios (WF-C08-G03)
REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_outbox_event(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_outbox_event(UUID, UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_processed_outbox_events(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_processed_outbox_events(INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.requeue_dead_letter_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requeue_dead_letter_event(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_board_outbox_audit_log(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_board_outbox_audit_log(UUID, INTEGER) TO authenticated;
