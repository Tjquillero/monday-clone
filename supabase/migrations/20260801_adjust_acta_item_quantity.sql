-- =============================================================================
-- Incremento 5, Commit 4 (dominio): adjust_acta_item_quantity()
-- Ref: docs/adr/ADR-0003-billing-source.md ("Mecanismo de emisión del Acta"),
--      docs/architecture/acta-billing-design.md.
--
-- CONTRATO (congelado antes de implementar):
--   Firma:      adjust_acta_item_quantity(p_acta_item_id UUID, p_cantidad NUMERIC)
--               RETURNS VOID
--   Autorización: solo admin del board dueño del acta (vía acta_item -> acta -> board_id).
--   Concurrencia: dos locks, cada uno con un propósito distinto —
--                 - FOR UPDATE sobre la fila de actas (mismo recurso que
--                   issue_acta()): sincroniza el ajuste con una emisión
--                   concurrente de la MISMA acta.
--                 - FOR UPDATE sobre la fila de acta_items: sincroniza dos
--                   administradores editando la MISMA línea al mismo tiempo
--                   (sin este lock, "A lee 100, B lee 100, A reduce a 70, B
--                   reduce a 80" pierde en silencio el cambio de A —
--                   actualización perdida, no corrupción de integridad
--                   referencial, pero sí un dato incorrecto).
--   Precondiciones (revalidadas bajo lock, no solo antes de tomarlo):
--                 - acta.estado = 'draft'.
--                 - 0 <= p_cantidad <= cantidad_facturada actual de la línea.
--                   SOLO reducción — un aumento no es la operación inversa
--                   de una reducción (una reducción libera saldo ya
--                   reservado; un aumento exige volver a descubrir saldo
--                   elegible en todo el universo de ejecuciones
--                   certificadas, la misma lógica de selección de
--                   generate_acta_draft()). Queda fuera de este contrato a
--                   propósito — es una operación distinta, con su propio
--                   contrato futuro si hace falta.
--   Efecto:     reduce acta_items.cantidad_facturada a p_cantidad y libera
--               el delta desde acta_item_sources en orden LIFO — inverso
--               exacto al orden de asignación ya congelado en
--               generate_acta_draft() (verified_at ASC, id ASC): aquí se
--               libera verified_at DESC, id DESC (de la ejecución, no de la
--               fila de origen), hasta agotar el delta. Una fuente que
--               llega a cantidad_consumida = 0 se ELIMINA (la tabla no
--               admite cantidad_consumida = 0, CHECK > 0). Preserva la
--               prioridad de las certificaciones más antiguas: son las
--               últimas en liberarse.
--   Nunca modifica: weekly_plan_item_executions, actas.* (excepto vía el
--               lock, sin escritura), poa_activities/poa_versions,
--               snapshots de acta_items (descripcion/unidad/precio_unitario),
--               ni ninguna acta issued (bloqueado además, en profundidad,
--               por el trigger de inmutabilidad ya existente).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.adjust_acta_item_quantity(
  p_acta_item_id UUID,
  p_cantidad     NUMERIC
)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_acta_id   UUID;
  v_board_id  UUID;
  v_estado    TEXT;
  v_current   NUMERIC;
  v_delta     NUMERIC;
  v_source    RECORD;
BEGIN
  -- Resolución inicial (sin lock) — solo para saber a qué acta/board
  -- pertenece esta línea y así poder chequear el rol y elegir qué filas
  -- bloquear a continuación.
  SELECT ai.acta_id, a.board_id
  INTO v_acta_id, v_board_id
  FROM public.acta_items ai
  JOIN public.actas a ON a.id = ai.acta_id
  WHERE ai.id = p_acta_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La línea de acta % no existe.', p_acta_item_id;
  END IF;

  IF get_user_board_role(v_board_id, auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden ajustar cantidades del Acta.';
  END IF;

  -- ── Lock 1: fila de actas (mismo recurso que issue_acta()) — sincroniza
  --    este ajuste con una emisión concurrente de la misma acta.
  SELECT estado INTO v_estado FROM public.actas WHERE id = v_acta_id FOR UPDATE;

  IF v_estado IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'El acta % no está en estado draft (actual: %). No se puede ajustar.', v_acta_id, v_estado;
  END IF;

  -- ── Lock 2: fila de acta_items — sincroniza dos ediciones concurrentes
  --    de la MISMA línea (evita una actualización perdida entre dos
  --    administradores).
  SELECT cantidad_facturada INTO v_current
  FROM public.acta_items WHERE id = p_acta_item_id FOR UPDATE;

  IF p_cantidad < 0 OR p_cantidad > v_current THEN
    RAISE EXCEPTION 'Cantidad inválida (%): debe estar entre 0 y % (cantidad_facturada actual de la línea). Un aumento más allá de lo ya asignado no está soportado por esta función.', p_cantidad, v_current;
  END IF;

  v_delta := v_current - p_cantidad;

  IF v_delta > 0 THEN
    FOR v_source IN
      SELECT ais.id AS source_id, ais.cantidad_consumida
      FROM public.acta_item_sources ais
      JOIN public.weekly_plan_item_executions e ON e.id = ais.execution_id
      WHERE ais.acta_item_id = p_acta_item_id
      ORDER BY e.verified_at DESC, e.id DESC
    LOOP
      EXIT WHEN v_delta <= 0;

      IF v_source.cantidad_consumida <= v_delta THEN
        DELETE FROM public.acta_item_sources WHERE id = v_source.source_id;
        v_delta := v_delta - v_source.cantidad_consumida;
      ELSE
        UPDATE public.acta_item_sources
        SET cantidad_consumida = cantidad_consumida - v_delta
        WHERE id = v_source.source_id;
        v_delta := 0;
      END IF;
    END LOOP;

    IF v_delta > 0 THEN
      RAISE EXCEPTION 'Inconsistencia interna: acta_item_sources no tiene saldo suficiente para liberar % de la línea % (delta restante %).', (v_current - p_cantidad), p_acta_item_id, v_delta;
    END IF;
  END IF;

  UPDATE public.acta_items SET cantidad_facturada = p_cantidad WHERE id = p_acta_item_id;
END;
$$;

COMMENT ON FUNCTION public.adjust_acta_item_quantity(UUID, NUMERIC) IS
  'Reduce cantidad_facturada de una línea de un acta draft (solo reducción — nunca aumenta), liberando el delta desde acta_item_sources en orden LIFO (verified_at DESC, id DESC de la ejecución), inverso exacto al orden de asignación de generate_acta_draft(). Fuentes que llegan a 0 se eliminan. Nunca modifica ejecuciones, snapshots, ni actas emitidas. Ver docs/adr/ADR-0003-billing-source.md.';
