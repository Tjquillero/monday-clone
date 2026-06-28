'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { BoardView } from '@/types/views';

function rowToView(row: any): BoardView {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    isDefault: row.is_default,
    filters: row.filters ?? [],
    sorts: row.sorts ?? [],
    visibleColumns: row.visible_columns ?? [],
    groupBy: row.settings?.groupBy,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function useBoardViews(boardId: string | undefined) {
  const queryClient = useQueryClient();
  const qk = ['board_views', boardId];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk });

  const { data: views = [], isLoading } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('board_views')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map(rowToView);
    },
    enabled: !!boardId,
    staleTime: 5 * 60 * 1000,
  });

  const saveView = useMutation({
    mutationFn: async (view: Omit<BoardView, 'id' | 'createdAt'> & { id?: string }) => {
      if (!boardId) throw new Error('boardId required');

      const payload = {
        board_id: boardId,
        name: view.name,
        is_default: view.isDefault ?? false,
        filters: view.filters,
        sorts: view.sorts,
        visible_columns: view.visibleColumns,
        settings: view.groupBy ? { groupBy: view.groupBy } : {},
      };

      if (view.id) {
        const { data, error } = await supabase
          .from('board_views')
          .update(payload)
          .eq('id', view.id)
          .select()
          .single();
        if (error) throw error;
        return rowToView(data);
      } else {
        const { data, error } = await supabase
          .from('board_views')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return rowToView(data);
      }
    },
    onSuccess: invalidate,
  });

  const deleteView = useMutation({
    mutationFn: async (viewId: string) => {
      const { error } = await supabase
        .from('board_views')
        .delete()
        .eq('id', viewId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setDefault = useMutation({
    mutationFn: async (viewId: string) => {
      // Unset current default, then set new one
      await supabase
        .from('board_views')
        .update({ is_default: false })
        .eq('board_id', boardId!);
      const { error } = await supabase
        .from('board_views')
        .update({ is_default: true })
        .eq('id', viewId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { views, isLoading, saveView, deleteView, setDefault };
}
