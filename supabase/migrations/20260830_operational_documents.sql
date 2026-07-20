-- =============================================================================
-- Documentos — Biblioteca Documental de Mantenix (Fase 1)
-- Ref: docs/operacion/README.md, docs/operacion/investigaciones/poa/INV-0001-salinas-del-rey.md
--
-- Fase 1: almacenar y versionar documentos operativos (POA, Resource
-- Analysis, Salarios, ...) dentro de la aplicación, con historial append-only
-- y un "vigente" por (board, tipo). document_metadata/processing_status
-- existen para que una futura Fase 2 (extracción automática) no requiera
-- otra migración — quedan vacíos/uploaded en esta fase, sin ningún parser.
--
-- Decisión explícita (revisada con el usuario): sin scope_type/scope_id
-- polimórfico (todo el dominio existente usa board_id sin excepción), sin
-- document_families (la agrupación ya la resuelve board_id+tipo+anio+
-- version_label), sin category/subcategory (document_types ya es
-- extensible por INSERT), sin document_chunks/embeddings (pipeline de RAG
-- inexistente hoy).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. document_types — catálogo extensible, nunca un CHECK en producción
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_types (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO public.document_types (code, name) VALUES
  ('POA',              'POA'),
  ('RESOURCE_ANALYSIS','Resource Analysis'),
  ('SALARIOS',         'Salarios'),
  ('CAPACIDADES',      'Capacidades'),
  ('CRONOGRAMA',       'Cronograma'),
  ('CATALOGO_TECNICO', 'Catálogo Técnico'),
  ('CONTRATO',         'Contrato'),
  ('OTROS',            'Otros')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cualquier usuario autenticado lee el catalogo de tipos" ON public.document_types;
CREATE POLICY "Cualquier usuario autenticado lee el catalogo de tipos"
  ON public.document_types FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. operational_documents
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operational_documents (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id           UUID        NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  tipo_documento     TEXT        NOT NULL REFERENCES public.document_types(code),
  anio               INT,
  version_label      TEXT        NOT NULL,
  es_vigente         BOOLEAN     NOT NULL DEFAULT false,
  title              TEXT        NOT NULL,
  tags               TEXT[]      NOT NULL DEFAULT '{}',
  storage_path       TEXT        NOT NULL,
  file_name          TEXT        NOT NULL,
  file_size          INT,
  document_hash      TEXT,
  document_metadata  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  processing_status  TEXT        NOT NULL DEFAULT 'uploaded'
                      CHECK (processing_status IN ('uploaded','processing','processed','failed')),
  observaciones      TEXT,
  uploaded_by        UUID        NOT NULL REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un solo documento vigente por (board, tipo) — mismo principio que
-- board_activity_standards: nunca dos estándares vigentes simultáneos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_documents_vigente
  ON public.operational_documents (board_id, tipo_documento) WHERE es_vigente;

CREATE INDEX IF NOT EXISTS idx_operational_documents_title
  ON public.operational_documents (title);

CREATE INDEX IF NOT EXISTS idx_operational_documents_board_tipo
  ON public.operational_documents (board_id, tipo_documento);

ALTER TABLE public.operational_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros ven los documentos de su board" ON public.operational_documents;
CREATE POLICY "Miembros ven los documentos de su board"
  ON public.operational_documents FOR SELECT
  USING (get_user_board_role(board_id, auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Solo admin sube documentos" ON public.operational_documents;
CREATE POLICY "Solo admin sube documentos"
  ON public.operational_documents FOR INSERT
  WITH CHECK (get_user_board_role(board_id, auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Solo admin marca vigente/actualiza documentos" ON public.operational_documents;
CREATE POLICY "Solo admin marca vigente/actualiza documentos"
  ON public.operational_documents FOR UPDATE
  USING (get_user_board_role(board_id, auth.uid()) = 'admin')
  WITH CHECK (get_user_board_role(board_id, auth.uid()) = 'admin');

-- Sin política DELETE: append-only. Un documento superado se marca
-- es_vigente = false, nunca se borra — necesitas poder responder "¿con
-- qué versión se calculó esta factura?".

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mark_operational_document_vigente — transición atómica
--
-- Contrato: desmarca el vigente anterior del mismo (board, tipo) y marca el
-- nuevo, en la misma transacción — nunca deja al board sin vigente a medio
-- camino, nunca viola el índice único. SECURITY INVOKER: no se apoya en
-- ninguna llamada anidada a una función DEFINER, valida admin explícito.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_operational_document_vigente(p_document_id UUID)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_board_id UUID;
  v_tipo     TEXT;
BEGIN
  SELECT board_id, tipo_documento INTO v_board_id, v_tipo
  FROM public.operational_documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento % no existe.', p_document_id;
  END IF;

  IF get_user_board_role(v_board_id, auth.uid()) != 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar un documento como vigente.';
  END IF;

  UPDATE public.operational_documents
  SET es_vigente = false
  WHERE board_id = v_board_id AND tipo_documento = v_tipo AND es_vigente = true;

  UPDATE public.operational_documents
  SET es_vigente = true
  WHERE id = p_document_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Storage — bucket privado (a diferencia de attachments/evidence, que son
-- públicos: estos son documentos contractuales, acceso solo vía URL firmada).
-- Ruta: {board_id}/{tipo_documento}/{timestamp}-{nombre_archivo} — el primer
-- segmento de la ruta es el board_id, verificado contra get_user_board_role
-- en cada política, igual que la tabla.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'operational-documents', 'operational-documents', false, 20971520,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Miembros leen documentos de su board en storage" ON storage.objects;
CREATE POLICY "Miembros leen documentos de su board en storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'operational-documents'
    AND get_user_board_role(((storage.foldername(name))[1])::uuid, auth.uid()) IS NOT NULL
  );

DROP POLICY IF EXISTS "Solo admin sube documentos a storage" ON storage.objects;
CREATE POLICY "Solo admin sube documentos a storage"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'operational-documents'
    AND get_user_board_role(((storage.foldername(name))[1])::uuid, auth.uid()) = 'admin'
  );

-- Sin política UPDATE/DELETE sobre el objeto binario: cada versión es un
-- archivo nuevo (append-only), igual que la tabla.
