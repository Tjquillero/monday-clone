-- =============================================================================
-- execution_attachments.file_hash — prerrequisito de dominio para v2.4
-- (detección de duplicados exactos). Mismo espíritu que `phase` en v2.3:
-- primero el dato objetivo, la IA (si acaso) llega después. Para
-- duplicados exactos NO hace falta IA en absoluto — "¿este archivo ya
-- existe?" se responde comparando hashes, determinístico.
--
-- Decisiones congeladas con el usuario:
--   - file_hash = SHA-256 del contenido binario, calculado en el CLIENTE
--     antes de subir (Web Crypto), enviado junto al resto de metadatos en
--     el INSERT — no requiere Edge Functions ni procesamiento en el
--     servidor. Mismo patrón que ya se sigue en useExecutionAttachments.ts.
--   - NULLABLE, sin DEFAULT: fotos históricas (subidas antes de este
--     cambio) quedan file_hash = NULL — nunca se recalcula
--     retroactivamente descargando el archivo.
--   - Sin restricción UNIQUE: dos archivos con el mismo hash son un
--     hallazgo a REPORTAR (por el tool de IA), no un INSERT a bloquear —
--     "detección", no "prevención". Bloquear en el INSERT sería una
--     decisión de negocio distinta, no pedida aquí.
--   - Reutilizable fuera de la IA: auditoría, deduplicación de storage,
--     detectar errores de subida — no es una preparación exclusiva para
--     el copiloto.
-- =============================================================================

ALTER TABLE public.execution_attachments
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

COMMENT ON COLUMN public.execution_attachments.file_hash IS
  'SHA-256 del contenido binario del archivo, calculado en el cliente antes de subir. Dos filas con el mismo file_hash son el mismo archivo, byte a byte — esto nunca lo decide un modelo de IA. NULL = fotos subidas antes de este cambio (nunca se recalcula retroactivamente). Sin restricción UNIQUE a propósito: un duplicado es un hallazgo a reportar, no un INSERT a bloquear.';

CREATE INDEX IF NOT EXISTS idx_execution_attachments_file_hash
  ON public.execution_attachments (file_hash)
  WHERE file_hash IS NOT NULL;
