-- =============================================================================
-- IA — Fase 1, Hito 0: infraestructura del orquestador (sin lógica de negocio)
-- Ref: contrato acordado con el usuario — "IA como copiloto del dominio", no
--      chat genérico. Los tools NUNCA tocan tablas directamente, solo RPCs
--      oficiales — misma frontera que ya protege el subsistema del Acta.
--
-- Propósito de este commit: probar la tubería completa (sesión server-side
-- con auth.uid() real → RPC → DTO → log) con el tool más simple posible,
-- SIN aportar ningún valor de negocio todavía. Si algo falla aquí, se sabe
-- que es infraestructura, no dominio — antes de construir compute_acta_totals
-- como tool (Hito 1) o cualquier tool nuevo (Hito 2).
--
-- Piezas:
--   1. ai_tool_call_attempts — log de CADA intento de tool, esté o no en la
--      whitelist (la whitelist real vive en código, en el Tool Registry —
--      esta tabla es evidencia/auditoría, no la fuente de verdad de qué
--      está permitido).
--   2. log_ai_tool_call_attempt() — único camino de escritura a esa tabla
--      (deny-by-default en RLS, sin políticas de escritura — mismo patrón
--      que actas/acta_items/acta_item_sources).
--   3. get_current_board(p_board_id) — el tool de prueba de Hito 0. Ejercita
--      exactamente lo mismo que ejercitará cualquier tool futuro: sesión con
--      auth.uid() real, chequeo de membresía vía get_user_board_role(), DTO
--      de salida (nunca una fila cruda de `boards`).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_tool_call_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id),
  board_id        UUID        REFERENCES public.boards(id),
  tool_name       TEXT        NOT NULL,
  is_whitelisted  BOOLEAN     NOT NULL,
  arguments       JSONB,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_call_attempts_tool_name ON public.ai_tool_call_attempts (tool_name);
CREATE INDEX IF NOT EXISTS idx_ai_tool_call_attempts_not_whitelisted ON public.ai_tool_call_attempts (tool_name) WHERE NOT is_whitelisted;

COMMENT ON TABLE public.ai_tool_call_attempts IS
  'Auditoría de cada tool que el modelo pidió ejecutar, esté o no autorizado. La whitelist real vive en el Tool Registry (código), no aquí — esta tabla es evidencia para decidir qué tools construir después, pedidos por uso real, no diseñados en una reunión.';

-- Deny-by-default: RLS activo, sin políticas — ni lectura ni escritura
-- directa desde el cliente. Todo pasa por log_ai_tool_call_attempt()
-- (SECURITY DEFINER) o, para lectura futura, por una función/policy admin
-- todavía no definida (fuera de alcance de Hito 0).
ALTER TABLE public.ai_tool_call_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.log_ai_tool_call_attempt(
  p_board_id       UUID,
  p_tool_name      TEXT,
  p_is_whitelisted BOOLEAN,
  p_arguments      JSONB DEFAULT NULL,
  p_error          TEXT  DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.ai_tool_call_attempts (user_id, board_id, tool_name, is_whitelisted, arguments, error)
  VALUES (auth.uid(), p_board_id, p_tool_name, p_is_whitelisted, p_arguments, p_error)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_ai_tool_call_attempt(UUID, TEXT, BOOLEAN, JSONB, TEXT) IS
  'Único camino de escritura a ai_tool_call_attempts. No valida nada de negocio — el Orchestrator ya decidió is_whitelisted antes de llamar aquí; esta función solo registra.';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_current_board — tool de prueba de Hito 0. Cero valor de negocio a
-- propósito: solo confirma que auth.uid() resuelve correctamente cuando la
-- llamada llega desde el servidor (Route Handler) con la sesión reenviada,
-- no desde el navegador.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_current_board(p_board_id UUID)
RETURNS TABLE(
  board_id   UUID,
  board_name TEXT,
  role       TEXT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := get_user_board_role(p_board_id, auth.uid());
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  RETURN QUERY
  SELECT b.id, b.name, v_role
  FROM public.boards b
  WHERE b.id = p_board_id;
END;
$$;

COMMENT ON FUNCTION public.get_current_board(UUID) IS
  'Tool de IA (Hito 0, infraestructura): confirma board + rol del usuario actual. Sin valor de negocio a propósito — prueba la tubería completa (sesión server-side, auth.uid(), RPC, DTO) antes de construir tools reales.';
