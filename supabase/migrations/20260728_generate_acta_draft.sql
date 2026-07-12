-- =============================================================================
-- Incremento 5, Commit 2/N: generate_acta_draft()
-- Ref: docs/architecture/acta-billing-design.md, docs/adr/ADR-0003-billing-source.md
--      ("Mecanismo de emisión del Acta"), docs/domain/poa-domain.md (Regla 7).
--
-- CONTRATO (congelado antes de escribir esta función):
--   Firma:      generate_acta_draft(p_board_id UUID) RETURNS UUID
--   Entrada:    únicamente board_id — nunca un período. El acta no tiene
--               relación fija con un período semanal ni con un mes
--               calendario (Regla 7); acoplar la función a un "periodo"
--               reintroduciría exactamente la suposición que se corrigió.
--   Universo:   ejecuciones weekly_plan_item_executions.status = 'verified'
--               CUYO PLAN YA ESTÁ weekly_plans.status = 'closed' (el cierre
--               del período certifica — ADR-0003, "Mecanismo de emisión")
--               Y con saldo facturable > 0, definido exactamente como:
--                 executed_qty - COALESCE(SUM(acta_item_sources.cantidad_consumida
--                   de esa ejecución, a través de TODAS las actas), 0)
--   Alcance:    TODO el saldo pendiente del board — no una selección
--               parcial. Reducir a una porción es una decisión manual
--               posterior del administrador sobre el borrador ya creado,
--               no algo que esta función decida.
--   Agrupación: una línea (acta_items) por poa_activity_id — nunca combina
--               dos actividades en una línea (Regla 14).
--   Snapshots:  descripcion/unidad desde board_activity_standards vigente
--               (effective_to IS NULL, mismo patrón que confirm_weekly_plan);
--               precio_unitario desde poa_activities de la versión ACTIVE.
--   Idempotencia: si ya existe un acta con estado='draft' para este board,
--               se devuelve su id sin crear nada nuevo — nunca duplica
--               líneas ni vuelve a representar cantidades. Invariante
--               respaldado por índice único parcial (ver abajo), no solo
--               por la lógica de la función — dos llamadas concurrentes no
--               pueden crear dos borradores para el mismo board.
--   Efecto:     el borrador REPRESENTA (no "consume") el 100% del saldo
--               facturable pendiente mediante filas en acta_item_sources —
--               weekly_plan_item_executions nunca se modifica; sigue sin
--               saber si fue facturada.
--   Nunca modifica: ninguna acta con estado='issued'; ninguna ejecución.
--   Orden determinista: las filas de acta_item_sources se crean en orden
--               weekly_plan_item_executions.verified_at ASC, id ASC — sin
--               esto, el orden de Postgres sin ORDER BY es una sugerencia,
--               no una promesa.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Invariante estructural: como máximo un borrador (draft) abierto por board.
-- Respaldado por el motor, no solo por la función — dos llamadas concurrentes
-- a generate_acta_draft() para el mismo board nunca pueden crear dos filas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_actas_one_open_draft_per_board
  ON public.actas (board_id) WHERE estado = 'draft';

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_acta_draft
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_acta_draft(p_board_id UUID)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_acta_id UUID;
  v_line    RECORD;
  v_item_id UUID;
  v_source  RECORD;
BEGIN
  IF get_user_board_role(p_board_id, auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden generar el borrador del Acta.';
  END IF;

  -- ── Idempotencia: un borrador abierto ya existente se devuelve tal cual.
  SELECT id INTO v_acta_id FROM public.actas WHERE board_id = p_board_id AND estado = 'draft';
  IF FOUND THEN
    RETURN v_acta_id;
  END IF;

  INSERT INTO public.actas (board_id, generated_by)
  VALUES (p_board_id, auth.uid())
  RETURNING id INTO v_acta_id;

  -- ── Una línea por poa_activity_id con saldo facturable pendiente > 0,
  --    agregando el saldo de todas sus ejecuciones elegibles.
  FOR v_line IN
    SELECT
      pa.id              AS poa_activity_id,
      pa.precio_unitario AS precio_unitario,
      COALESCE(bas.name, pa.activity_key) AS descripcion,
      COALESCE(bas.unit, '')              AS unidad,
      SUM(sq.saldo)      AS total_pendiente
    FROM (
      SELECT
        e.id             AS execution_id,
        paz.poa_activity_id,
        e.executed_qty - COALESCE(
          (SELECT SUM(ais.cantidad_consumida)
           FROM public.acta_item_sources ais
           WHERE ais.execution_id = e.id),
          0
        ) AS saldo
      FROM public.weekly_plan_item_executions e
      JOIN public.weekly_plan_items    i   ON i.id  = e.plan_item_id
      JOIN public.weekly_plans         wp  ON wp.id = i.plan_id
      JOIN public.poa_activity_zones   paz ON paz.id = i.poa_activity_zone_id
      WHERE wp.board_id  = p_board_id
        AND wp.status    = 'closed'
        AND e.status     = 'verified'
    ) sq
    JOIN public.poa_activities pa ON pa.id = sq.poa_activity_id
    LEFT JOIN public.board_activity_standards bas
      ON  bas.board_id     = p_board_id
      AND bas.activity_key = pa.activity_key
      AND bas.effective_to IS NULL
    WHERE sq.saldo > 0
    GROUP BY pa.id, pa.precio_unitario, bas.name, bas.activity_key, bas.unit
  LOOP
    INSERT INTO public.acta_items (
      acta_id, poa_activity_id, descripcion_snapshot, unidad_snapshot,
      precio_unitario_snapshot, cantidad_facturada
    ) VALUES (
      v_acta_id, v_line.poa_activity_id, v_line.descripcion, v_line.unidad,
      v_line.precio_unitario, v_line.total_pendiente
    )
    RETURNING id INTO v_item_id;

    -- ── Orden determinista: verified_at ASC, id ASC.
    FOR v_source IN
      SELECT
        e.id AS execution_id,
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
      WHERE wp.board_id        = p_board_id
        AND wp.status          = 'closed'
        AND e.status           = 'verified'
        AND paz.poa_activity_id = v_line.poa_activity_id
      ORDER BY e.verified_at ASC, e.id ASC
    LOOP
      IF v_source.saldo > 0 THEN
        INSERT INTO public.acta_item_sources (acta_item_id, execution_id, cantidad_consumida)
        VALUES (v_item_id, v_source.execution_id, v_source.saldo);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_acta_id;
END;
$$;

COMMENT ON FUNCTION public.generate_acta_draft(UUID) IS
  'Genera (o devuelve, si ya existe) el borrador de Acta con el 100% del saldo facturable pendiente del board — ejecuciones verified de planes closed, agrupadas por poa_activity_id, en orden determinista (verified_at, id). Nunca modifica ejecuciones ni actas ya emitidas. Ver docs/adr/ADR-0003-billing-source.md.';
