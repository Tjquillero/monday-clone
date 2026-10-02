-- ============================================================================
-- Migración: 2026100104_counts_capacity.sql
-- Propósito: Agregar columna counts_capacity a operational_frequencies (D28 / GATE FREQ-OP-03)
--            Las actividades con counts_capacity = false (máquinas/equipos pesados)
--            no computan contra la capacidad diaria de jornales del sitio.
-- ============================================================================

ALTER TABLE public.operational_frequencies
  ADD COLUMN IF NOT EXISTS counts_capacity BOOLEAN NOT NULL DEFAULT true;
