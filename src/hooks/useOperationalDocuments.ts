'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Documentos — Biblioteca Documental de Mantenix (Fase 1)
//
// Almacena y versiona documentos operativos (POA, Resource Analysis,
// Salarios, ...) — ver supabase/migrations/20260830_operational_documents.sql
// y docs/operacion/README.md. No hay fórmula ni interpretación de negocio
// aquí: solo subir/listar/marcar vigente. La extracción automática de
// metadatos y la búsqueda dentro del documento quedan para Fase 2/3.
//
// Igual que el resto de la app (ver Catálogo Técnico), los botones de
// admin no se ocultan por rol en el cliente — RLS es la fuente real de
// verdad; un intento no autorizado falla con un mensaje claro.
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentType {
  code: string;
  name: string;
  display_order: number;
}

export interface OperationalDocument {
  id: string;
  board_id: string;
  tipo_documento: string;
  anio: number | null;
  version_label: string;
  es_vigente: boolean;
  title: string;
  tags: string[];
  storage_path: string;
  file_name: string;
  file_size: number | null;
  document_hash: string | null;
  observaciones: string | null;
  uploaded_by: string;
  created_at: string;
}

export const OPERATIONAL_DOCUMENTS_BUCKET = 'operational-documents';

export function useDocumentTypes() {
  return useQuery({
    queryKey: ['document_types'],
    queryFn: async (): Promise<DocumentType[]> => {
      const { data, error } = await supabase.from('document_types').select('*').order('display_order');
      if (error) throw error;
      return (data ?? []) as DocumentType[];
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useOperationalDocuments(boardId: string | undefined) {
  return useQuery({
    queryKey: ['operational_documents', boardId],
    queryFn: async (): Promise<OperationalDocument[]> => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('operational_documents')
        .select('*')
        .eq('board_id', boardId)
        .order('tipo_documento')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OperationalDocument[];
    },
    enabled: !!boardId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface UploadOperationalDocumentInput {
  boardId: string;
  tipoDocumento: string;
  anio: number | null;
  versionLabel: string;
  title: string;
  tags: string[];
  observaciones: string | null;
  file: File;
}

export function useUploadOperationalDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: UploadOperationalDocumentInput) => {
      if (!user) throw new Error('Sesión no válida.');

      const hash = await computeSha256(input.file);
      const storagePath = `${input.boardId}/${input.tipoDocumento}/${Date.now()}-${input.file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(OPERATIONAL_DOCUMENTS_BUCKET)
        .upload(storagePath, input.file);
      if (uploadError) throw uploadError;

      const { data, error: dbError } = await supabase
        .from('operational_documents')
        .insert({
          board_id: input.boardId,
          tipo_documento: input.tipoDocumento,
          anio: input.anio,
          version_label: input.versionLabel,
          title: input.title,
          tags: input.tags,
          storage_path: storagePath,
          file_name: input.file.name,
          file_size: input.file.size,
          document_hash: hash,
          observaciones: input.observaciones,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) {
        // El archivo ya se subió a Storage — se limpia si la fila falla,
        // para no dejar un objeto huérfano sin registro.
        await supabase.storage.from(OPERATIONAL_DOCUMENTS_BUCKET).remove([storagePath]);
        throw dbError;
      }

      return data as OperationalDocument;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['operational_documents', variables.boardId] });
    },
  });
}

export function useMarkOperationalDocumentVigente(boardId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.rpc('mark_operational_document_vigente', {
        p_document_id: documentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operational_documents', boardId] });
    },
  });
}

export async function getOperationalDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(OPERATIONAL_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
