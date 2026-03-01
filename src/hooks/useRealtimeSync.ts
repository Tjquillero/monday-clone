'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export function useRealtimeSync(boardId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!boardId) return;

    const channel = supabase
      .channel(`rt-sync-${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['groups', boardId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_columns' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['columns', boardId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_dependencies' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['task_dependencies', boardId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, queryClient]);
}
