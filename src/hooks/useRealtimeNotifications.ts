import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { UserNotification } from '@/types/notification';

/**
 * Hook de Consumo Híbrido (Persistencia Durable + Supabase Realtime) para Notificaciones (Fase 4 · Módulo 5).
 * 1. Carga inicial de notificaciones durables desde BD (Resiliente a desconexión/offline - NOTIF-14).
 * 2. Suscripción a canal Supabase Realtime determinista `notifications:user:<user_id>` (NOTIF-10).
 * 3. Transición unidireccional de lectura via RPC `mark_notification_read` (M5-SEC.1).
 */
export function useRealtimeNotifications(userId: string | null | undefined, boardId?: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ['user-notifications', userId, boardId];

  // 1. Carga inicial durable de notificaciones no leídas
  const query = useQuery<UserNotification[]>({
    queryKey,
    queryFn: async () => {
      if (!userId) return [];

      let q = supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (boardId) {
        q = q.eq('board_id', boardId);
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((n: any) => ({
        id: n.id,
        event_id: n.event_id,
        notification_dedup_key: n.notification_dedup_key,
        user_id: n.user_id,
        board_id: n.board_id,
        alert_code: n.alert_code,
        entity_id: n.entity_id,
        severity: n.severity,
        title: n.title,
        message: n.message,
        is_read: Boolean(n.is_read),
        created_at: n.created_at,
        read_at: n.read_at,
      }));
    },
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 2, // 2 mins cache
  });

  // 2. Suscripción a canal Supabase Realtime determinista
  useEffect(() => {
    if (!userId) return;

    const channelName = `notifications:user:${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          // Invalidar query para refrescar de forma durable e inmediata
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, boardId, queryClient, queryKey]);

  // 3. Transición unidireccional UNREAD -> READ via RPC mark_notification_read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc('mark_notification_read', {
        p_notification_id: notificationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    markAsRead: markAsReadMutation.mutate,
    isMarkingRead: markAsReadMutation.isPending,
  };
}
