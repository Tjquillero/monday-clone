-- ============================================================================
-- Semilla: 2026100104_counts_capacity_seed.sql
-- Propósito: Configurar actividades de maquinaria (counts_capacity = false) (D28 / GATE FREQ-OP-03)
--            Actividades: 1.11, 1.14, 1.15, 2.17
-- Tablero: 3ea0326f-6ff7-409f-848a-1f296e6e3cc8
-- ============================================================================

UPDATE public.operational_frequencies
SET counts_capacity = false
WHERE board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID
  AND activity_key IN ('1.11', '1.14', '1.15', '2.17');

-- Control: Verificar actividades de máquina con counts_capacity = false
SELECT 
  g.title AS sitio,
  opf.activity_key,
  opf.visits_per_month,
  opf.counts_capacity,
  opf.source
FROM public.operational_frequencies opf
JOIN public.groups g ON g.id = opf.group_id
WHERE opf.board_id = '3ea0326f-6ff7-409f-848a-1f296e6e3cc8'::UUID
  AND opf.counts_capacity = false
ORDER BY g.title, opf.activity_key;
