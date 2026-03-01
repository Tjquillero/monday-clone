import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Acta, ActaDetail } from '@/types/monday';

export const useActas = (boardId?: string) => {
  return useQuery({
    queryKey: ['actas', boardId],
    queryFn: async () => {
      if (!boardId) return [];
      const { data, error } = await supabase
        .from('financial_actas')
        .select('*')
        .eq('board_id', boardId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data as Acta[];
    },
    enabled: !!boardId,
  });
};

export const useActaDetails = (actaId?: string) => {
  return useQuery({
    queryKey: ['acta_details', actaId],
    queryFn: async () => {
      if (!actaId) return [];
      const { data, error } = await supabase
        .from('financial_acta_details')
        .select('id,acta_id,item_id,group_id,quantity,value,percentage,previous_qty,previous_value,created_at,updated_at')
        .eq('acta_id', actaId);

      if (error) throw error;
      return data as ActaDetail[];
    },
    enabled: !!actaId,
  });
};

export const useActaMutations = (boardId?: string) => {
  const queryClient = useQueryClient();

  const createActa = useMutation({
    mutationFn: async (acta: Omit<Acta, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('financial_actas')
        .insert(acta)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actas', boardId] });
    },
  });

  const updateActa = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Acta> }) => {
      const { error } = await supabase
        .from('financial_actas')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actas', boardId] });
    },
  });

  const deleteActa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financial_actas')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actas', boardId] });
    },
  });

  const upsertActaDetail = useMutation({
    mutationFn: async (detail: Omit<ActaDetail, 'id' | 'created_at'>) => {
        // Basic UPSERT logic
        const { data, error } = await supabase
            .from('financial_acta_details')
            .upsert(detail, { onConflict: 'acta_id, item_id, group_id' })
            .select('id,acta_id,item_id,group_id,quantity,value,percentage,previous_qty,previous_value,created_at,updated_at')
            .single();

        if (error) throw error;
        return data;
    },
    onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ['acta_details', variables.acta_id] });
        if (boardId) {
            queryClient.invalidateQueries({ queryKey: ['acta_details_board', boardId] });
        }
    }
  });

  const deleteActaDetail = useMutation({
    mutationFn: async ({ acta_id, item_id, group_id }: { acta_id: string, item_id: string, group_id: string }) => {
      const { error } = await supabase
        .from('financial_acta_details')
        .delete()
        .match({ acta_id, item_id, group_id });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['acta_details', variables.acta_id] });
      if (boardId) {
          queryClient.invalidateQueries({ queryKey: ['acta_details_board', boardId] });
      }
    }
  });

  return { createActa, updateActa, deleteActa, upsertActaDetail, deleteActaDetail };
};

export const useActaDetailsByBoard = (boardId?: string) => {
    return useQuery({
        queryKey: ['acta_details_board', boardId],
        queryFn: async () => {
            if (!boardId) return [];
            // Join with actas to filter by board_id is implicit via the actas list, 
            // but fetching all details for the board is more efficient for history calculation 
            // if we filter in memory, OR we can filter by approved actas in SQL.
            // For now, fetching all details for the board is acceptable for "small" datasets.
            
            // First get actas for this board
            const { data: actas, error: actasError } = await supabase
                .from('financial_actas')
                .select('id')
                .eq('board_id', boardId);
            
            if (actasError) throw actasError;
            if (!actas || actas.length === 0) return [];

            const actaIds = actas.map(a => a.id);

            const { data: details, error: detailsError } = await supabase
                .from('financial_acta_details')
                .select('id,acta_id,item_id,group_id,quantity,value,percentage,previous_qty,previous_value,created_at,updated_at')
                .in('acta_id', actaIds);

            if (detailsError) throw detailsError;
            return details as ActaDetail[];
        },
        enabled: !!boardId,
        staleTime: 1000 * 60 * 5 // Cache for 5 minutes
    });
};
