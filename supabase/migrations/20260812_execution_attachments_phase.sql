-- =============================================================================
-- execution_attachments.phase — concepto de dominio "antes/después"
-- Ref: prerrequisito de v2.3 (comparación antes/después), Fase 5 del
-- copiloto de IA — pero esto NO es una necesidad de la IA, es un concepto
-- de dominio que hoy no existe: la tabla no distingue en qué momento de la
-- jornada se tomó cada foto. La IA es simplemente un consumidor más de
-- este dato, igual que auditorías, reportes o exportaciones futuras.
--
-- Decisiones congeladas con el usuario antes de esta migración:
--   - TEXT + CHECK, no un ENUM nativo de Postgres — mismo patrón que TODO
--     el resto del esquema (weekly_plans.status, poa_versions.status,
--     weekly_plan_item_executions.status), confirmado por grep antes de
--     escribir esto: cero CREATE TYPE ... AS ENUM en todo el proyecto.
--   - NULLABLE, sin DEFAULT: las fotos históricas quedan phase = NULL —
--     nunca se infiere con created_at (sería una regla inventada, el orden
--     de subida no garantiza el orden temporal real de la evidencia).
--   - "Una foto pertenece a una sola fase" ya queda garantizado por ser una
--     columna simple (no una relación N:M) — no hace falta una restricción
--     adicional para esto.
--   - Deliberadamente SIN exigir "al menos una foto 'before' y una 'after'"
--     — esa obligatoriedad cambiaría el flujo operativo de certificación y
--     merece discutirse aparte, no colarse en este cambio de esquema.
-- =============================================================================

ALTER TABLE public.execution_attachments
  ADD COLUMN IF NOT EXISTS phase TEXT CHECK (phase IN ('before', 'after'));

COMMENT ON COLUMN public.execution_attachments.phase IS
  'Fase de la evidencia: before (previo a la intervención) o after (posterior). NULL = sin clasificar (fotos históricas o subidas antes de este cambio). Nunca se infiere desde created_at.';
