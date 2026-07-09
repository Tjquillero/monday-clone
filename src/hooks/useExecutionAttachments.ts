'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { ATTACHMENT_BUCKET, buildAttachmentPath, extractStoragePathFromPublicUrl } from '@/lib/storageUtils';

// ─────────────────────────────────────────────────────────────────────────────
// useExecutionAttachments
//
// Evidencia fotográfica de una Jornada (weekly_plan_item_executions).
// Mismo patrón que useAttachments.ts (tabla `attachments` para items
// genéricos), aplicado a execution_attachments — misma convención de RLS
// y de Storage, entidad padre distinta (execution_id en vez de item_id).
// Reutiliza el bucket 'attachments' bajo el prefijo execution/{executionId}/.
// Ref: docs/architecture/execution-certification-design.md
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionAttachment {
  id: string;
  execution_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export function useExecutionAttachments(executionId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: attachments, isLoading } = useQuery({
    queryKey: ['execution_attachments', executionId],
    queryFn: async (): Promise<ExecutionAttachment[]> => {
      if (!executionId) return [];
      const { data, error } = await supabase
        .from('execution_attachments')
        .select('*')
        .eq('execution_id', executionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as ExecutionAttachment[];
    },
    enabled: !!executionId,
    staleTime: 60_000,
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!executionId || !user) throw new Error('Falta executionId o usuario');

      const filePath = buildAttachmentPath('execution', executionId, file.name);

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(ATTACHMENT_BUCKET)
        .getPublicUrl(filePath);

      const { data, error: dbError } = await supabase
        .from('execution_attachments')
        .insert({
          execution_id: executionId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      return data as ExecutionAttachment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution_attachments', executionId] });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: ExecutionAttachment) => {
      const path = extractStoragePathFromPublicUrl(attachment.file_url);
      if (path) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
      }
      const { error } = await supabase
        .from('execution_attachments')
        .delete()
        .eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution_attachments', executionId] });
    },
  });

  return { attachments, isLoading, uploadAttachment, deleteAttachment };
}
