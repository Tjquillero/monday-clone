-- =============================================================================
-- IA — Fase 1, Hito 1+2: las dos primeras tools de negocio
-- Ref: docs/adr/ADR-0003-billing-source.md (fuente de los datos), contrato
--      del orquestador (project_ai_copiloto en memoria).
--
-- Regla congelada: ninguna función nueva reimplementa cálculo ya existente.
-- get_acta_summary() ENVUELVE compute_acta_totals() (no reescribe el AIU);
-- get_pending_billable_work() extrae exactamente la misma condición de
-- elegibilidad que ya usa generate_acta_draft() (verified + closed + saldo
-- > 0), como lectura agregada reutilizable — no solo por la IA, también por
-- dashboards futuros.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- get_acta_summary — Hito 1. DTO estable para "¿cuánto vale esta acta?".
-- No duplica el AIU: llama a compute_acta_totals() y le agrega los campos
-- de cabecera (numero, estado) que ese contrato no incluye a propósito
-- (compute_acta_totals es puramente financiero).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_acta_summary(p_acta_id UUID)
RETURNS TABLE(
  numero         INT,
  estado         TEXT,
  subtotal       NUMERIC,
  administracion NUMERIC,
  imprevistos    NUMERIC,
  utilidad       NUMERIC,
  total_pagar    NUMERIC
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  -- La autorización vive en compute_acta_totals() (ya prueba member-only) —
  -- si el usuario no tiene acceso, esa llamada lanza excepción y aborta
  -- todo el statement antes de devolver ninguna fila (incluida numero/estado).
  SELECT a.numero, a.estado, t.subtotal, t.administracion, t.imprevistos, t.utilidad, t.total_pagar
  FROM public.actas a, public.compute_acta_totals(p_acta_id) t
  WHERE a.id = p_acta_id;
$$;

COMMENT ON FUNCTION public.get_acta_summary(UUID) IS
  'DTO estable para el tool de IA get_acta_totals: cabecera del acta (numero, estado) + totales oficiales de compute_acta_totals(). No recalcula nada — envuelve, no duplica.';

-- ─────────────────────────────────────────────────────────────────────────────
-- get_pending_billable_work — Hito 2. Extrae la condición de elegibilidad ya
-- probada de generate_acta_draft() (verified + closed + saldo > 0), como su
-- propia lectura agregada. Mismos JOINs, mismo filtro — sin ellos, esta
-- función podría divergir silenciosamente de lo que el generador realmente
-- factura.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_pending_billable_work(p_board_id UUID)
RETURNS TABLE(
  activities      INT,
  executions      INT,
  estimated_value NUMERIC,
  currency        TEXT
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a este board.';
  END IF;

  RETURN QUERY
  WITH pending AS (
    SELECT
      e.id               AS execution_id,
      paz.poa_activity_id,
      pa.precio_unitario,
      e.executed_qty - COALESCE(
        (SELECT SUM(ais.cantidad_consumida)
         FROM public.acta_item_sources ais
         WHERE ais.execution_id = e.id),
        0
      ) AS saldo
    FROM public.weekly_plan_item_executions e
    JOIN public.weekly_plan_items  i   ON i.id  = e.plan_item_id
    JOIN public.weekly_plans       wp  ON wp.id = i.plan_id
    JOIN public.poa_activity_zones paz ON paz.id = i.poa_activity_zone_id
    JOIN public.poa_activities     pa  ON pa.id  = paz.poa_activity_id
    WHERE wp.board_id = p_board_id
      AND wp.status    = 'closed'
      AND e.status     = 'verified'
  ),
  filtered AS (
    SELECT * FROM pending WHERE saldo > 0
  )
  SELECT
    COUNT(DISTINCT poa_activity_id)::INT AS activities,
    COUNT(DISTINCT execution_id)::INT    AS executions,
    COALESCE(SUM(saldo * precio_unitario), 0) AS estimated_value,
    'COP'::TEXT AS currency
  FROM filtered;
END;
$$;

COMMENT ON FUNCTION public.get_pending_billable_work(UUID) IS
  'DTO estable para el tool de IA get_pending_billable_work: cuántas actividades/ejecuciones certificadas están pendientes de facturar y su valor estimado. Misma condición de elegibilidad que generate_acta_draft() (verified + closed + saldo > 0) — extraída, no reinventada. Reutilizable fuera de IA (dashboards).';
