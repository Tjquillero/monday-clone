-- Migration: 20260913_add_used_resources_to_executions.sql
-- Description: Agrega columna used_resources JSONB e índice de idempotencia a weekly_plan_item_executions (POD-01 / ADR-0014)

-- 1. Agregar columna de recursos consumidos con default de arreglo vacío
ALTER TABLE public.weekly_plan_item_executions
ADD COLUMN IF NOT EXISTS used_resources JSONB DEFAULT '[]'::jsonb NOT NULL;

-- 2. Constraint de integridad estructural: garantiza que el valor sea estrictamente un JSON Array
ALTER TABLE public.weekly_plan_item_executions
DROP CONSTRAINT IF EXISTS chk_used_resources_is_array;

ALTER TABLE public.weekly_plan_item_executions
ADD CONSTRAINT chk_used_resources_is_array
CHECK (jsonb_typeof(used_resources) = 'array');

-- 3. Garantía física de unicidad e idempotencia para reintentos y sincronización offline (C1/C2)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wpie_source_mutation_id 
ON public.weekly_plan_item_executions (source_mutation_id) 
WHERE source_mutation_id IS NOT NULL;

-- 4. Comentario descriptivo del contrato
COMMENT ON COLUMN public.weekly_plan_item_executions.used_resources IS 
'Snapshot inmutable de recursos operativos consumidos (MATERIAL, EQUIPO_MENOR, EQUIPO_MAYOR) observados en esta ejecución física específica (POD-01 / ADR-0014).';
