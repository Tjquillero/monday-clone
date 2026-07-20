-- =============================================================================
-- document_types.display_order — mismo patrón que board_roles.display_order
-- (20260709_weekly_plans_nucleus.sql). Sin esto, useDocumentTypes() ordena
-- alfabéticamente por code y "CAPACIDADES" aparece antes que "POA" en la UI
-- (encontrado en la verificación E2E de la Biblioteca de Documentos, Fase 1).
-- =============================================================================

ALTER TABLE public.document_types ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 99;

UPDATE public.document_types SET display_order = ordered.display_order
FROM (VALUES
  ('POA', 1),
  ('RESOURCE_ANALYSIS', 2),
  ('SALARIOS', 3),
  ('CAPACIDADES', 4),
  ('CRONOGRAMA', 5),
  ('CATALOGO_TECNICO', 6),
  ('CONTRATO', 7),
  ('OTROS', 8)
) AS ordered(code, display_order)
WHERE public.document_types.code = ordered.code;
