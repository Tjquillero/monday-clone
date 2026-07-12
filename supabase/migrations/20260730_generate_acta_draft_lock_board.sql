-- =============================================================================
-- Incremento 5, Commit 3.1: cierra la ventana de concurrencia entre
-- generate_acta_draft() e issue_acta().
--
-- HALLAZGO (revisión previa al commit de git del Commit 3):
--   generate_acta_draft() decidía si ya existía un draft abierto con un
--   SELECT simple (sin FOR UPDATE) sobre actas, mientras que issue_acta()
--   sí bloquea la fila de boards antes de emitir. Bajo READ COMMITTED, ese
--   SELECT no espera el lock de boards que sostiene issue_acta() — puede
--   leer "todavía draft" un instante antes de que la emisión confirme,
--   devolviendo un acta_id que deja de ser editable justo después. El
--   índice único parcial (un draft por board) y los triggers de
--   inmutabilidad ya impiden cualquier corrupción real de datos, pero la
--   ventana en sí es evitable.
--
-- FIX: generate_acta_draft() ahora toma el MISMO lock de boards que
--   issue_acta(), como primer paso. Esto serializa ambas funciones sobre el
--   mismo recurso por board — dos llamadas concurrentes (una generando,
--   otra emitiendo) quedan correctamente ordenadas en vez de intercalarse.
--   No cambia ningún otro comportamiento del contrato ya congelado.
-- =============================================================================

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

  -- ── Mismo lock que issue_acta(): serializa generate_acta_draft() e
  --    issue_acta() sobre el mismo board, cerrando la ventana donde un
  --    SELECT sin lock podía leer "draft" un instante antes de que otra
  --    transacción confirmara su emisión.
  PERFORM id FROM public.boards WHERE id = p_board_id FOR UPDATE;

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
  'Genera (o devuelve, si ya existe) el borrador de Acta con el 100% del saldo facturable pendiente del board — ejecuciones verified de planes closed, agrupadas por poa_activity_id, en orden determinista (verified_at, id). Nunca modifica ejecuciones ni actas ya emitidas. Toma lock de boards (mismo recurso que issue_acta()) para serializarse correctamente con la emisión concurrente. Ver docs/adr/ADR-0003-billing-source.md.';
