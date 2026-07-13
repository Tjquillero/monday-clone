-- =============================================================================
-- IA — Fase 1: get_board_summary() — el punto de entrada de casi cualquier
-- conversación ("¿cómo va el contrato?", "hazme un resumen").
--
-- CONTRATO (congelado antes de implementar):
--   contractedValue  = SUM(poa_activities.precio_unitario * poa_activity_zones.cantidad_contratada)
--                       de la versión ACTIVA del POA. Fuente: POA vigente
--                       (ADR-0003, "Cantidad contratada").
--   certifiedValue   = SUM(executed_qty * precio_unitario) de ejecuciones
--                       verified de planes closed — misma condición de
--                       elegibilidad ya usada en generate_acta_draft() /
--                       get_pending_billable_work() (deliberadamente SIN
--                       filtrar por poa_version_id: ni generate_acta_draft()
--                       lo hace, y filtrar aquí introduciría una
--                       inconsistencia nueva entre tools en vez de heredar
--                       el comportamiento ya establecido). Fuente: ejecuciones
--                       verified de un período cerrado — "el cierre certifica"
--                       (ADR-0003, "Mecanismo de emisión del Acta").
--   contractProgress = certifiedValue / contractedValue * 100 (0 si no hay
--                       POA activo o contractedValue = 0).
--   pendingBillableValue = delega en get_pending_billable_work() — no
--                       duplica su cálculo.
--   NO incluye "actividades completadas/pendientes": una actividad
--                       contractual (diaria/semanal/mensual/recurrente)
--                       nunca "termina" mientras el contrato esté vigente —
--                       no existe esa definición en el dominio, no se
--                       inventa aquí.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_board_summary(p_board_id UUID)
RETURNS TABLE(
  board_id               UUID,
  board_name             TEXT,
  active_poa_version     INT,
  contracted_value       NUMERIC,
  certified_value        NUMERIC,
  contract_progress      NUMERIC,
  draft_actas            INT,
  issued_actas           INT,
  pending_billable_value NUMERIC,
  currency               TEXT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_name    TEXT;
  v_version_id    UUID;
  v_version_num   INT;
  v_contracted    NUMERIC := 0;
  v_certified     NUMERIC := 0;
  v_progress      NUMERIC := 0;
  v_draft_count   INT;
  v_issued_count  INT;
  v_pending       NUMERIC;
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  SELECT b.name INTO v_board_name FROM public.boards b WHERE b.id = p_board_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El board % no existe.', p_board_id;
  END IF;

  -- Versión activa del POA (puede no existir todavía — ver Tablero Principal).
  SELECT pv.id, pv.version_number
  INTO v_version_id, v_version_num
  FROM public.poa p
  JOIN public.poa_versions pv ON pv.poa_id = p.id AND pv.status = 'active'
  WHERE p.board_id = p_board_id;

  IF v_version_id IS NOT NULL THEN
    -- Denominador: valor contratado, SOLO de la versión activa.
    SELECT COALESCE(SUM(pa.precio_unitario * paz.cantidad_contratada), 0)
    INTO v_contracted
    FROM public.poa_activities pa
    JOIN public.poa_activity_zones paz ON paz.poa_activity_id = pa.id
    WHERE pa.poa_version_id = v_version_id;
  END IF;

  -- Numerador: valor certificado — misma elegibilidad que generate_acta_draft()
  -- (verified + closed), sin filtrar por versión a propósito (ver contrato arriba).
  SELECT COALESCE(SUM(e.executed_qty * pa.precio_unitario), 0)
  INTO v_certified
  FROM public.weekly_plan_item_executions e
  JOIN public.weekly_plan_items  i   ON i.id  = e.plan_item_id
  JOIN public.weekly_plans       wp  ON wp.id = i.plan_id
  JOIN public.poa_activity_zones paz ON paz.id = i.poa_activity_zone_id
  JOIN public.poa_activities     pa  ON pa.id  = paz.poa_activity_id
  WHERE wp.board_id = p_board_id
    AND wp.status    = 'closed'
    AND e.status     = 'verified';

  IF v_contracted > 0 THEN
    v_progress := ROUND((v_certified / v_contracted) * 100, 1);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE a.estado = 'draft')::INT,
    COUNT(*) FILTER (WHERE a.estado = 'issued')::INT
  INTO v_draft_count, v_issued_count
  FROM public.actas a WHERE a.board_id = p_board_id;

  SELECT estimated_value INTO v_pending
  FROM public.get_pending_billable_work(p_board_id);

  RETURN QUERY SELECT
    p_board_id, v_board_name, v_version_num,
    v_contracted, v_certified, v_progress,
    v_draft_count, v_issued_count, v_pending, 'COP'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.get_board_summary(UUID) IS
  'DTO estable para el tool de IA get_board_summary: visión general del board (versión activa del POA, valor contratado, valor certificado, % de avance del contrato, actas draft/issued, saldo facturable pendiente). No incluye "actividades completadas/pendientes" — ese concepto no existe en el dominio POA (actividades recurrentes nunca "terminan").';
