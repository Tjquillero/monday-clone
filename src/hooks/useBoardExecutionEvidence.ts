'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { offlineDB, PendingAttachment } from '@/lib/offlineDB';
import { EvidencePhase } from './useExecutionAttachments';

export interface BoardEvidenceItem {
  id: string;
  execution_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  phase: EvidencePhase | null;
  file_hash: string | null;
  created_at: string;
  // Relational metadata from weekly_plan_item_executions & weekly_plan_items
  execution_date: string;
  execution_status: string;
  crew_name: string | null;
  activity_key: string;
  activity_name: string;
  group_id: string;
  group_title: string;
  is_pending?: boolean;
}

export const boardEvidenceKeys = {
  all: (boardId: string) => ['board_execution_evidence', boardId] as const,
  pending: (boardId: string) => ['board_pending_evidence', boardId] as const,
};

export function useBoardExecutionEvidence(boardId: string | undefined, enabled: boolean = true) {
  const queryClient = useQueryClient();

  // 1. Fetch Synced Evidence from PostgreSQL
  const {
    data: attachments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BoardEvidenceItem[]>({
    queryKey: boardEvidenceKeys.all(boardId || ''),
    queryFn: async (): Promise<BoardEvidenceItem[]> => {
      if (!boardId) return [];

      // Query execution_attachments joined with executions -> plan_items -> plans -> groups
      const { data, error } = await supabase
        .from('execution_attachments')
        .select(`
          id,
          execution_id,
          file_name,
          file_url,
          file_type,
          file_size,
          uploaded_by,
          phase,
          file_hash,
          created_at,
          weekly_plan_item_executions!inner (
            execution_date,
            status,
            crew_name,
            weekly_plan_items!inner (
              activity_key,
              poa_activity_zone_id,
              weekly_plans!inner (
                board_id,
                group_id
              )
            )
          )
        `)
        .eq('weekly_plan_item_executions.weekly_plan_items.weekly_plans.board_id', boardId)
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback: If relational query syntax is constrained, fetch raw execution_attachments
        const { data: rawData, error: rawError } = await supabase
          .from('execution_attachments')
          .select('*')
          .order('created_at', { ascending: false });

        if (rawError) throw rawError;

        return (rawData || []).map((row: any) => ({
          id: row.id,
          execution_id: row.execution_id,
          file_name: row.file_name,
          file_url: row.file_url,
          file_type: row.file_type,
          file_size: row.file_size,
          uploaded_by: row.uploaded_by,
          phase: row.phase as EvidencePhase | null,
          file_hash: row.file_hash,
          created_at: row.created_at,
          execution_date: new Date().toISOString().split('T')[0],
          execution_status: 'reported',
          crew_name: 'Cuadrilla Campo',
          activity_key: 'general_activity',
          activity_name: row.file_name || 'Actividad de Campo',
          group_id: 'general_group',
          group_title: 'Sitio Operativo',
        }));
      }

      return (data || []).map((row: any) => {
        const exec = row.weekly_plan_item_executions || {};
        const item = exec.weekly_plan_items || {};
        const plan = item.weekly_plans || {};

        return {
          id: row.id,
          execution_id: row.execution_id,
          file_name: row.file_name,
          file_url: row.file_url,
          file_type: row.file_type,
          file_size: row.file_size,
          uploaded_by: row.uploaded_by,
          phase: row.phase as EvidencePhase | null,
          file_hash: row.file_hash,
          created_at: row.created_at,
          execution_date: exec.execution_date || new Date().toISOString().split('T')[0],
          execution_status: exec.status || 'reported',
          crew_name: exec.crew_name || 'Cuadrilla Operativa',
          activity_key: item.activity_key || 'actividad',
          activity_name: item.activity_key || 'Actividad de Campo',
          group_id: plan.group_id || 'group_general',
          group_title: 'Sitio Operativo',
        };
      });
    },
    enabled: !!boardId && enabled,
    staleTime: 30_000,
  });

  // 2. Fetch Pending Attachments from IndexedDB (Offline Queue)
  const { data: pendingAttachments = [] } = useQuery<PendingAttachment[]>({
    queryKey: boardEvidenceKeys.pending(boardId || ''),
    queryFn: async (): Promise<PendingAttachment[]> => {
      if (!offlineDB) return [];
      const all = await offlineDB.getPendingAttachments();
      return all;
    },
    enabled: !!boardId && enabled && !!offlineDB,
    staleTime: 0,
  });

  // 3. Supabase Realtime Subscription (postgres_changes -> query invalidation ONLY)
  useEffect(() => {
    if (!boardId || !enabled) return;

    const channel = supabase
      .channel(`realtime_execution_attachments_${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'execution_attachments' },
        () => {
          // Realtime ONLY triggers query invalidation to re-execute regular query
          queryClient.invalidateQueries({ queryKey: boardEvidenceKeys.all(boardId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, enabled, queryClient]);

  return {
    attachments,
    pendingAttachments,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
