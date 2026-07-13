-- =============================================================================
-- Incremento 5, Commit 5 (dominio, previo al PDF): compute_acta_totals()
-- Ref: contrato financiero real del Excel del Acta (Acta 36, verificado por
--      el usuario), previamente hardcodeado como factor 1.30 en el reporte
--      histórico (ActaReportTemplate.ts / ActasModule.tsx).
--
-- CONTRATO (congelado antes de implementar):
--   Firma:      compute_acta_totals(p_acta_id UUID)
--               RETURNS TABLE(subtotal, administracion, imprevistos,
--                             utilidad, total_pagar NUMERIC)
--   Naturaleza: lectura pura (STABLE, sin efectos secundarios). Funciona
--               igual para un acta draft (proyección viva, recalcula en
--               cada llamada) que para una issued (queda fijo porque
--               acta_items ya es inmutable una vez emitida — el
--               "congelamiento" es consecuencia del invariante que ya
--               existe, esta función no lo reimplementa).
--   SECURITY DEFINER: no por necesidad de privilegio (el usuario que llama
--               ya puede leer acta_items vía la política SELECT de RLS
--               existente) — es una decisión deliberada de frontera: el
--               PDF (y cualquier consumidor futuro) invoca una operación
--               OFICIAL del dominio, no una consulta que hoy reproduce la
--               regla por casualidad. Si mañana el cálculo evoluciona
--               (IVA, retenciones, una vista distinta), el contrato de
--               esta función no cambia aunque su implementación interna sí.
--   CONSECUENCIA DE SECURITY DEFINER, no gratuita: al bypasear RLS, esta
--               función debe revalidar la autorización por sí misma —
--               igual que get_user_board_role(...) IS NOT NULL en la
--               política "Miembros pueden ver las actas de su board".
--               Sin este chequeo, cualquier usuario authenticated podría
--               invocarla con el acta_id de OTRO board y obtener totales
--               financieros reales. No es un caso hipotético: es
--               exactamente el mismo problema que resolvió la nota de
--               "Dependencia arquitectónica" del RLS del Acta, en sentido
--               inverso (ahí el problema era que el dominio necesitaba
--               bypassear RLS; aquí, que bypassear RLS sin querer amplía
--               el acceso).
--   Fórmula (copiada literal del Excel — no inventada, no simplificada a un
--               factor único 1.30 como hacía el reporte histórico):
--                 subtotal        = ROUND(SUM(acta_items.valor_total), 0)
--                 administracion  = ROUND(subtotal * 0.20, 0)
--                 imprevistos     = ROUND(subtotal * 0.05, 0)
--                 utilidad        = ROUND(subtotal * 0.05, 0)
--                 total_pagar     = subtotal + administracion + imprevistos
--                                   + utilidad
--               subtotal se redondea ANTES de aplicar los porcentajes
--               (igual que el Excel) — no se asume que valor_total sea
--               siempre entero solo porque hoy, con los datos actuales, lo
--               es.
--   Verificado empíricamente: ROUND() de PostgreSQL para NUMERIC redondea
--               mitad-lejos-de-cero (0.5->1, 2.5->3, -0.5->-1, -1.5->-2),
--               igual que ROUND() de Excel — sin discrepancia de casos
--               límite entre ambos.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_acta_totals(p_acta_id UUID)
RETURNS TABLE(
  subtotal       NUMERIC,
  administracion NUMERIC,
  imprevistos    NUMERIC,
  utilidad       NUMERIC,
  total_pagar    NUMERIC
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_id UUID;
BEGIN
  SELECT board_id INTO v_board_id FROM public.actas WHERE id = p_acta_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El acta % no existe.', p_acta_id;
  END IF;

  -- Mismo alcance que la política de RLS que esta función bypasea:
  -- cualquier miembro del board, no solo admin (lectura, no escritura).
  IF get_user_board_role(v_board_id, auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'No tiene acceso a los totales de este acta.';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ROUND(COALESCE(SUM(ai.valor_total), 0), 0) AS subtotal
    FROM public.acta_items ai
    WHERE ai.acta_id = p_acta_id
  )
  SELECT
    base.subtotal,
    ROUND(base.subtotal * 0.20, 0) AS administracion,
    ROUND(base.subtotal * 0.05, 0) AS imprevistos,
    ROUND(base.subtotal * 0.05, 0) AS utilidad,
    base.subtotal
      + ROUND(base.subtotal * 0.20, 0)
      + ROUND(base.subtotal * 0.05, 0)
      + ROUND(base.subtotal * 0.05, 0) AS total_pagar
  FROM base;
END;
$$;

COMMENT ON FUNCTION public.compute_acta_totals(UUID) IS
  'Totales financieros oficiales de un acta (AIU): subtotal, administracion (20%), imprevistos (5%), utilidad (5%), total_pagar. Fórmula copiada literal del Excel contractual (cada componente redondeado independientemente, luego sumados) — no un factor único 1.30. Único punto de cálculo; el PDF y cualquier consumidor futuro invocan esta función, nunca recalculan.';
