'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface OKR {
  id: string;
  title: string;
  description: string;
  target_date: string;
  icon: string;
  color: string;
  visibility: 'personal' | 'general';
  owner_id: string;
  progress: number;
  created_at: string;
}

export interface OKRLink {
  id: string;
  okr_id: string;
  board_id?: string;
  item_id?: string | number;
}

export function useOkrs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // 1. Fetch OKRs
  const { data: okrs = [], isLoading } = useQuery({
    queryKey: ['okrs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('okrs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as OKR[];
    },
    enabled: !!user,
  });

  // 2. Mutations
  const createOkr = useMutation({
    mutationFn: async (newOkr: Partial<OKR>) => {
      const { data, error } = await supabase
        .from('okrs')
        .insert({ ...newOkr, owner_id: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okrs'] }),
  });

  const updateOkr = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<OKR> }) => {
      const { data, error } = await supabase
        .from('okrs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okrs'] }),
  });

  const deleteOkr = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('okrs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okrs'] }),
  });

  // 3. OKR Links
  const { data: okrLinks = [] } = useQuery({
    queryKey: ['okr_links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('okr_links').select('*');
      if (error) throw error;
      return data as OKRLink[];
    },
    enabled: !!user,
  });

  const linkToBoard = useMutation({
    mutationFn: async ({ okrId, boardId }: { okrId: string; boardId: string }) => {
      const { data, error } = await supabase
        .from('okr_links')
        .insert({ okr_id: okrId, board_id: boardId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okr_links'] }),
  });

  const unlink = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from('okr_links').delete().eq('id', linkId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okr_links'] }),
  });

  const recalculateProgress = useMutation({
    mutationFn: async (okrId: string) => {
      // 1. Get links
      const { data: links } = await supabase
        .from('okr_links')
        .select('board_id')
        .eq('okr_id', okrId);
      
      if (!links || links.length === 0) {
        await supabase.from('okrs').update({ progress: 0 }).eq('id', okrId);
        return 0;
      }

      const boardIds = links.map(l => l.board_id).filter(Boolean);
      let totalProgress = 0;

      // 2. Calculate progress for each board
      for (const boardId of boardIds) {
        const { data: items } = await supabase
          .from('items')
          .select('values')
          .eq('group_id', (
            await supabase.from('groups').select('id').eq('board_id', boardId)
          ).data?.map(g => g.id) || []);

        if (items && items.length > 0) {
          const doneItems = items.filter(i => 
            i.values?.status === 'Done' || 
            i.values?.status === 'Completado' ||
            Object.values(i.values).includes('Done')
          ).length;
          totalProgress += (doneItems / items.length) * 100;
        }
      }

      const finalProgress = Math.round(totalProgress / boardIds.length);

      // 3. Update OKR
      await supabase.from('okrs').update({ progress: finalProgress }).eq('id', okrId);
      return finalProgress;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['okrs'] }),
  });

  return {
    okrs,
    isLoading,
    createOkr,
    updateOkr,
    deleteOkr,
    okrLinks,
    linkToBoard,
    unlink,
    recalculateProgress
  };
}
