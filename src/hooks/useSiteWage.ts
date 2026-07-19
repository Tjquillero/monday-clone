'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// useSiteWage
//
// Costo por jornal de un sitio — mismo origen que ya usa
// ResourceEfficiencyWidget (resource_analysis.wages_data), leído aquí de
// forma independiente porque el Dashboard de Costos Operativos no comparte
// el resto del estado (scope_data/workers_data) de ese widget.
// ─────────────────────────────────────────────────────────────────────────────

export function useSiteWage(boardId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: ['site_wage', boardId, groupId],
    queryFn: async (): Promise<number> => {
      if (!boardId || !groupId) return 0;

      const { data, error } = await supabase
        .from('resource_analysis')
        .select('wages_data')
        .eq('board_id', boardId)
        .eq('site_id', groupId)
        .maybeSingle();

      if (error) throw error;
      return data?.wages_data ?? 0;
    },
    enabled: !!boardId && !!groupId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
