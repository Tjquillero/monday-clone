'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB, PendingAttachment } from '@/lib/offlineDB';
import { isNetworkError } from './useBoardData';
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
//
// Offline (Incremento 3, carril 3): si la subida falla por red, el archivo
// se encola como PendingAttachment (Blob en IndexedDB) en vez de perderse.
// `pendingAttachments` expone esos Blobs locales para que la galería los
// muestre de inmediato (URL.createObjectURL, estado transitorio — ver
// Sección 4 del diseño offline) mientras useOfflineSync los sube de verdad.
// ─────────────────────────────────────────────────────────────────────────────

// Límite explícito antes de aceptar la captura (Sección 4 del diseño offline):
// sin esto, un dispositivo puede acumular cientos de MB en IndexedDB sin que
// nadie lo note mientras espera conexión.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

// 'before' (previo a la intervención) | 'after' (posterior) | null (sin
// clasificar — fotos históricas o subidas sin elegir fase). Concepto de
// dominio, no una preparación para IA — ver 20260812_execution_attachments_phase.sql.
export type EvidencePhase = 'before' | 'after';

export interface ExecutionAttachment {
  id: string;
  execution_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  phase: EvidencePhase | null;
  created_at: string;
}

export type UploadAttachmentResult =
  | { queued: false; attachment: ExecutionAttachment }
  | { queued: true; pending: PendingAttachment };

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

  const { data: pendingAttachments } = useQuery({
    queryKey: ['pending_attachments', executionId],
    queryFn: async (): Promise<PendingAttachment[]> => {
      if (!executionId || !offlineDB) return [];
      const all: PendingAttachment[] = await offlineDB.getPendingAttachments();
      return all.filter((p) => p.execution_id === executionId);
    },
    enabled: !!executionId && !!offlineDB,
    staleTime: 0,
  });

  const uploadAttachment = useMutation<UploadAttachmentResult, Error, { file: File; phase?: EvidencePhase }>({
    mutationFn: async ({ file, phase }) => {
      if (!executionId || !user) throw new Error('Falta executionId o usuario');
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`La foto pesa ${(file.size / 1024 / 1024).toFixed(1)} MB — el máximo permitido es 8 MB.`);
      }

      const offline = typeof window !== 'undefined' && !window.navigator.onLine;
      if (!offline) {
        try {
          const filePath = buildAttachmentPath('execution', executionId, file.name);
          const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(filePath, file);
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(filePath);

          const { data, error: dbError } = await supabase
            .from('execution_attachments')
            .insert({
              execution_id: executionId,
              file_name: file.name,
              file_url: publicUrl,
              file_type: file.type,
              file_size: file.size,
              uploaded_by: user.id,
              phase: phase ?? null,
            })
            .select()
            .single();
          if (dbError) throw dbError;

          return { queued: false, attachment: data as ExecutionAttachment };
        } catch (err: any) {
          if (!isNetworkError(err)) throw err; // fallo real (RLS, validación): mostrar, no encolar
        }
      }

      if (!offlineDB) throw new Error('Sin conexión y sin caché local disponible.');
      const pending = await offlineDB.addPendingAttachment({
        execution_id: executionId,
        file,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
        phase: phase ?? null,
      });
      return { queued: true, pending };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution_attachments', executionId] });
      // Invalida todo bajo 'pending_attachments' (por execution y el mapa
      // resumen de useSyncState.ts) — prefijo común, un solo punto de verdad.
      queryClient.invalidateQueries({ queryKey: ['pending_attachments'] });
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

  const deletePendingAttachment = useMutation({
    mutationFn: async (pendingId: string) => {
      if (!offlineDB) return;
      await offlineDB.removePendingAttachment(pendingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending_attachments'] });
    },
  });

  return {
    attachments, isLoading, pendingAttachments,
    uploadAttachment, deleteAttachment, deletePendingAttachment,
  };
}

// Nota: el resumen de adjuntos pendientes por ejecución (para el badge de
// "Evidencias" en Mis Actividades) vive en src/hooks/useSyncState.ts
// (useAttachmentSyncSummaries) — único origen de verdad, ya distingue
// pendiente/sincronizando/conflicto en vez de un conteo plano (Incremento 4c).
