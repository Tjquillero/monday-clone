-- =============================================================================
-- Incremento 5, Commit 3/N: issue_acta()
-- Ref: docs/architecture/acta-billing-design.md, docs/adr/ADR-0003-billing-source.md
--      ("Mecanismo de emisión del Acta").
--
-- CONTRATO (congelado antes de escribir esta función):
--   Firma:      issue_acta(p_acta_id UUID) RETURNS UUID
--   Autorización: solo admin del board dueño del acta.
--   Concurrencia (numero): SELECT ... FROM boards WHERE id = board_id
--               FOR UPDATE, ANTES de calcular MAX(numero)+1. El lock
--               serializa las emisiones de UN mismo board entre sí, no
--               globalmente — mismo patrón ya probado en
--               import_poa_version() para poa_versions.version_number.
--               Sin tabla de contadores nueva: el siguiente número ya está
--               implícito en las actas ya emitidas de ese board.
--   Re-chequeo bajo lock: tras obtener el lock del board, se vuelve a leer
--               (con FOR UPDATE) el acta indicada por p_acta_id. Si otra
--               transacción ya la emitió mientras se esperaba el lock, esta
--               función falla explícito (estado != 'draft') — nunca
--               reasigna ni reintenta un número.
--   Numeración inicial: boards.acta_numero_inicial (nullable). Si el
--               contrato YA tenía actas emitidas fuera de este sistema
--               (ej. el negocio va en Acta 37 en papel), se configura el
--               primer numero a asignar (ej. 38) sin sembrar actas
--               históricas ni migraciones especiales. Si es NULL, el
--               comportamiento por defecto es empezar en 1. Fórmula:
--                 numero := GREATEST(MAX(numero_ya_emitido)+1, offset)
--               Tras la primera emisión, MAX(numero) ya domina la fórmula
--               y el offset deja de tener efecto — el algoritmo es el
--               mismo para todos los boards, configurados o no.
--   Precondición — borrador vacío: se RECHAZA emitir un acta sin ninguna
--               línea en acta_items, o cuya suma de cantidad_facturada sea
--               0. Un acta emitida es un documento contractual de cobro;
--               sin conceptos facturables no tiene significado de negocio.
--   Efecto atómico: asigna numero, estado='issued', issued_by=auth.uid(),
--               issued_at=NOW(). No modifica ninguna otra columna del
--               acta ni de sus líneas/fuentes.
--   Inmutabilidad: es una regla de DOMINIO, no de autorización — "nadie
--               puede modificar un acta ya emitida", distinto de "quién
--               puede emitir". Se implementa aquí, en este commit, como
--               triggers estructurales (no se difiere al commit de RLS
--               pendiente para actas/acta_items/acta_item_sources):
--                 - actas:             UPDATE/DELETE bloqueados si
--                                      OLD.estado = 'issued' (la propia
--                                      transición draft→issued que hace
--                                      esta función SÍ pasa, porque en ese
--                                      momento OLD.estado todavía es
--                                      'draft').
--                 - acta_items:        UPDATE/DELETE bloqueados si el acta
--                                      padre ya está issued.
--                 - acta_item_sources: UPDATE/DELETE bloqueados si el
--                                      acta_item padre (vía su acta) ya
--                                      está issued.
--               Por defecto, TODAS las columnas de un acta issued quedan
--               congeladas (incluida observaciones) — no hay ningún
--               requisito de negocio hoy que exija editar un acta después
--               de emitida; si aparece, se amplía el trigger entonces.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Numeración inicial configurable por board (Commit 3).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS acta_numero_inicial INT CHECK (acta_numero_inicial > 0);

COMMENT ON COLUMN public.boards.acta_numero_inicial IS
  'Primer numero de Acta a asignar por issue_acta() en este board, cuando el contrato ya tenía actas emitidas fuera de este sistema. NULL = arranca en 1. Deja de tener efecto en cuanto existe al menos un acta issued (a partir de ahí domina MAX(numero)+1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. issue_acta
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_acta(p_acta_id UUID)
RETURNS UUID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_id     UUID;
  v_estado       TEXT;
  v_offset       INT;
  v_next_numero  INT;
  v_item_count   INT;
  v_total        NUMERIC;
BEGIN
  -- Resolución inicial (sin lock) — solo para saber a qué board pertenece
  -- y así poder chequear el rol y elegir qué fila de boards bloquear.
  SELECT board_id INTO v_board_id FROM public.actas WHERE id = p_acta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El acta % no existe.', p_acta_id;
  END IF;

  IF get_user_board_role(v_board_id, auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden emitir el Acta.';
  END IF;

  -- ── Lock del board: serializa las emisiones de ESTE board entre sí, no
  --    globalmente (mismo patrón que import_poa_version()).
  SELECT acta_numero_inicial INTO v_offset
  FROM public.boards WHERE id = v_board_id FOR UPDATE;

  -- ── Re-lectura AUTORITATIVA, ya bajo el lock: si otra transacción emitió
  --    esta misma acta mientras se esperaba el lock del board, se revela
  --    aquí como estado != 'draft' — nunca se reasigna un número.
  SELECT estado, board_id INTO v_estado, v_board_id
  FROM public.actas WHERE id = p_acta_id FOR UPDATE;

  IF v_estado IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'El acta % no está en estado draft (actual: %). No se puede emitir.', p_acta_id, v_estado;
  END IF;

  -- ── Precondición: no se emite un acta sin contenido facturable.
  SELECT COUNT(*), COALESCE(SUM(cantidad_facturada), 0)
  INTO v_item_count, v_total
  FROM public.acta_items WHERE acta_id = p_acta_id;

  IF v_item_count = 0 OR v_total <= 0 THEN
    RAISE EXCEPTION 'No se puede emitir un acta sin líneas facturables (acta %).', p_acta_id;
  END IF;

  -- ── Numeración: el mayor entre "siguiente tras el último emitido" y el
  --    offset configurado (si lo hay). Tras la primera emisión, MAX(numero)
  --    ya domina y el offset deja de influir.
  v_next_numero := GREATEST(
    COALESCE((SELECT MAX(numero) FROM public.actas WHERE board_id = v_board_id), 0) + 1,
    COALESCE(v_offset, 1)
  );

  UPDATE public.actas
  SET numero = v_next_numero, estado = 'issued', issued_by = auth.uid(), issued_at = NOW()
  WHERE id = p_acta_id;

  RETURN p_acta_id;
END;
$$;

COMMENT ON FUNCTION public.issue_acta(UUID) IS
  'Emite (draft -> issued) el acta indicada: asigna numero de forma segura bajo concurrencia (lock de boards + MAX+1, con offset configurable por board) y congela el documento. Rechaza actas sin líneas facturables. Ver docs/adr/ADR-0003-billing-source.md.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Inmutabilidad estructural post-emisión — regla de dominio, no de RLS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_block_actas_mutation_when_issued()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.estado = 'issued' THEN
    RAISE EXCEPTION 'El acta % ya fue emitida y es inmutable.', OLD.id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trig_actas_block_mutation_when_issued
  BEFORE UPDATE OR DELETE ON public.actas
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_actas_mutation_when_issued();

CREATE OR REPLACE FUNCTION public.fn_block_acta_item_mutation_when_issued()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.actas WHERE id = OLD.acta_id AND estado = 'issued') THEN
    RAISE EXCEPTION 'La línea % pertenece a un acta ya emitida y es inmutable.', OLD.id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trig_acta_items_block_mutation_when_issued
  BEFORE UPDATE OR DELETE ON public.acta_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_acta_item_mutation_when_issued();

CREATE OR REPLACE FUNCTION public.fn_block_acta_item_source_mutation_when_issued()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.acta_items ai
    JOIN public.actas a ON a.id = ai.acta_id
    WHERE ai.id = OLD.acta_item_id AND a.estado = 'issued'
  ) THEN
    RAISE EXCEPTION 'La fuente % pertenece a un acta ya emitida y es inmutable.', OLD.id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trig_acta_item_sources_block_mutation_when_issued
  BEFORE UPDATE OR DELETE ON public.acta_item_sources
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_acta_item_source_mutation_when_issued();
