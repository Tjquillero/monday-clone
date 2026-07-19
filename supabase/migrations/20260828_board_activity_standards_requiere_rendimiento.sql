-- =============================================================================
-- board_activity_standards.requiere_rendimiento — distingue "no aplica" de
-- "falta configurar". Ver docs/architecture/poa-technical-catalog-decoupling.md,
-- Decisión 4.
--
-- Contrato:
--   - true  (default) = la actividad se planifica por rendimiento técnico
--     (comportamiento de siempre; default explícito para no requerir
--     backfill de las filas ya existentes).
--   - false = decisión deliberada de que esta actividad no se planifica por
--     rendimiento (reactiva, por evento, por volumen retirado, por condición
--     de campo) — rendimiento queda NULL, nunca 0 ni un número inventado.
--   - "Pendiente" NO es un tercer valor de esta columna: sigue
--     representándose por la AUSENCIA de fila (get_missing_board_activity_
--     standards ya usa NOT EXISTS, sin cambios) — persistir una fila
--     "todavía sin revisar" violaría ADR-0008 Regla 2 (ninguna equivalencia
--     se persiste sin confirmación humana). Como una fila solo se crea tras
--     una decisión explícita, `requiere_rendimiento = false` nunca es
--     ambiguo con "campo sin revisar".
--   - El CHECK original `rendimiento > 0` no se toca: en Postgres un CHECK
--     evalúa a verdadero cuando el operando es NULL, así que ya permite
--     rendimiento NULL sin necesidad de eliminarlo. El nuevo CHECK cruzado
--     es el que impide las combinaciones inválidas (requiere_rendimiento
--     sin número, no-requiere con número).
-- =============================================================================

ALTER TABLE public.board_activity_standards
  ALTER COLUMN rendimiento DROP NOT NULL;

ALTER TABLE public.board_activity_standards
  ADD COLUMN requiere_rendimiento BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.board_activity_standards
  ADD CONSTRAINT chk_bas_rendimiento_por_requiere CHECK (
    (requiere_rendimiento = true  AND rendimiento IS NOT NULL AND rendimiento > 0) OR
    (requiere_rendimiento = false AND rendimiento IS NULL)
  );

COMMENT ON COLUMN public.board_activity_standards.requiere_rendimiento IS
  'true = se planifica por rendimiento tecnico (default); false = decision deliberada de que no aplica (reactiva/por evento/por condicion de campo). "Pendiente" se representa por ausencia de fila, no por un valor de esta columna.';
