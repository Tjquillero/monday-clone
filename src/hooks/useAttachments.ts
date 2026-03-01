'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface Attachment {
  id: string;
  item_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

export function useAttachments(itemId?: string | number) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: attachments, isLoading } = useQuery({
    queryKey: ['attachments', itemId],
    queryFn: async () => {
      if (!itemId) return [];
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Attachment[];
    },
    enabled: !!itemId,
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ file, isEvidence = false }: { file: File, isEvidence?: boolean }) => {
      if (!itemId || !user) throw new Error('Missing itemId or user');

      // 1. Upload to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${itemId}/${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `attachments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      // 3. Save to Database
      const { data, error: dbError } = await supabase
        .from('attachments')
        .insert({
          item_id: itemId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // 4. Update evidence column if requested
      if (isEvidence) {
          const { data: currentItem } = await supabase.from('items').select('values').eq('id', itemId).single();
          const currentEvidence = currentItem?.values?.evidence || [];
          const newEvidence = [...currentEvidence, { url: publicUrl, timestamp: new Date().toISOString(), userId: user.id }];
          await supabase.from('items').update({ values: { ...currentItem?.values, evidence: newEvidence } }).eq('id', itemId);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', itemId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] }); // To update UI indicators
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: Attachment) => {
      // 1. Delete from Storage (extract path from URL)
      const path = attachment.file_url.split('/storage/v1/object/public/attachments/')[1];
      if (path) {
        await supabase.storage.from('attachments').remove([path]);
      }

      // 2. Delete from Database
      const { error } = await supabase
        .from('attachments')
        .delete()
        .eq('id', attachment.id);

      if (error) throw error;
    },
    onMutate: async (deletedAttachment) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['attachments', itemId] });

      // Snapshot the previous value
      const previousAttachments = queryClient.getQueryData(['attachments', itemId]);

      // Optimistically update to the new value
      queryClient.setQueryData(['attachments', itemId], (old: Attachment[] | undefined) => 
        old?.filter(a => a.id !== deletedAttachment.id)
      );

      // Return a context object with the snapshotted value
      return { previousAttachments };
    },
    onError: (err, deletedAttachment, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousAttachments) {
        queryClient.setQueryData(['attachments', itemId], context.previousAttachments);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we're in sync with the server
      queryClient.invalidateQueries({ queryKey: ['attachments', itemId] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  return {
    attachments,
    isLoading,
    uploadAttachment,
    deleteAttachment
  };
}
