-- =============================================================================
-- poa_activities pasa a ser autocontenido: agrega description/unit
-- Ref: docs/architecture/poa-technical-catalog-decoupling.md, Decisión 1
--
-- poa_activities es el catálogo contractual de la versión del POA — una
-- actividad contractual sin descripción ni unidad está incompleta desde el
-- dominio, no solo desde la UI. Depender del Excel original para mostrar un
-- nombre (reportes, auditoría de versiones, comparación entre versiones,
-- la lista de "pendientes de configuración técnica") es una dependencia
-- externa evitable.
--
-- Backfill: 45 filas existentes en toda la base, todas de boards de prueba
-- (E2E) — ningún board real (Tablero Principal) tiene poa_activities
-- todavía, porque su importación real sigue bloqueada. El texto centinela
-- es explícito, nunca inventa una descripción real.
--
-- Este commit NO cambia ningún comportamiento todavía — solo agrega las
-- columnas y las puebla para las filas existentes. import_poa_version()
-- se actualiza en el siguiente commit de este mismo incremento.
--
-- DEFAULT a propósito (no solo backfill): import_poa_version() SIEMPRE
-- envía description/unit reales — es la única vía de escritura (RLS
-- bloquea INSERT directo, ver 20260721_import_poa_version.sql, Sección 2) —
-- así que este DEFAULT nunca se ejercita en datos reales. Existe para que
-- fixtures de pgTAP de otros archivos (que insertan poa_activities
-- directamente como `postgres`, con columnas explícitas sin description/
-- unit, ajenas a este incremento) no se rompan por un NOT NULL que no les
-- interesa — no relaja la garantía real, que depende de quién puede
-- escribir, no de si la columna tiene default.
-- =============================================================================

ALTER TABLE public.poa_activities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS unit        TEXT;

UPDATE public.poa_activities
  SET description = '(sin descripción histórica)', unit = '(sin unidad histórica)'
  WHERE description IS NULL;

ALTER TABLE public.poa_activities
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN unit        SET NOT NULL,
  ALTER COLUMN description SET DEFAULT '(sin descripción)',
  ALTER COLUMN unit        SET DEFAULT '(sin unidad)';
