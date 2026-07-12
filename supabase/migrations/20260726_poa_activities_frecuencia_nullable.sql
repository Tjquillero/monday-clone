-- =============================================================================
-- poa_activities.frecuencia se vuelve nullable
-- Ref: docs/discovery/poa-frequency-per-zone.md, docs/adr/ADR-0005-*.md
--
-- Decisión de negocio: una celda FREC. vacía en el Excel no es un error de
-- captura. El dominio admite actividades que permanecen contratadas
-- (cantidad_contratada > 0 en alguna zona) pero sin programación periódica en
-- una versión determinada del POA — cuando la operación lo requiera, una
-- versión posterior del POA le asigna frecuencia. `frecuencia = NULL`
-- representa ese estado, no un dato faltante.
--
-- Alcance de este commit, deliberadamente estrecho: SOLO el caso inequívoco
-- en que NINGUNA zona contratada de la actividad reporta FREC. (sin mezcla
-- de zonas con y sin valor, sin inferir ni consolidar). El caso de
-- frecuencia real mezclada con ausencia, y el caso de frecuencia real que
-- varía entre zonas, siguen bloqueando la importación exactamente igual que
-- antes — esta migración no cambia esa lógica, solo deja de rechazar
-- físicamente NULL en la columna.
-- =============================================================================

-- El CHECK (frecuencia > 0) existente no necesita reescribirse: por
-- especificación de Postgres, un check constraint se considera satisfecho
-- cuando la expresión evalúa a NULL, no solo a TRUE — "frecuencia IS NULL"
-- ya pasa ese CHECK sin cambios. Solo hace falta levantar el NOT NULL.
ALTER TABLE public.poa_activities
  ALTER COLUMN frecuencia DROP NOT NULL;
