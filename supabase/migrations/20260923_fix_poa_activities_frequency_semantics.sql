-- =============================================================================
-- Migration: 20260923_fix_poa_activities_frequency_semantics.sql
-- Goal: Corrección Gobernada de Frecuencias Contractuales v1.0
--
-- Traduce la semántica de frecuencia de poa_activities para las actividades
-- semanales 1.09, 1.10, 1.11 (que se registraron como 1 en la importación inicial)
-- a la notación canónica del Scheduler (frecuencia = 4 = 1 ocurrencia semanal).
-- =============================================================================

BEGIN;

-- 1. Actualizar poa_activities para las actividades semanales afectadas
UPDATE public.poa_activities
SET frecuencia = 4
WHERE activity_key IN ('1.09', '1.10', '1.11')
  AND (frecuencia = 1 OR frecuencia IS NULL);

-- 2. Sincronizar el catálogo técnico de tableros (board_activity_standards)
UPDATE public.board_activity_standards
SET frecuencia = 4
WHERE activity_key IN ('1.09', '1.10', '1.11')
  AND (frecuencia = 1 OR frecuencia IS NULL);

COMMIT;
