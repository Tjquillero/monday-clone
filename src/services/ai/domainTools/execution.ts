import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools de ejecución/verificación — ver domainTools/actas.ts para la
// explicación general de esta capa (Tool Registry -> DomainTools -> RPC).

export interface ExecutionSummaryDto {
  boardId: string;
  reported: number;
  verified: number;
  rejected: number;
  total: number;
}

export async function getExecutionSummary(
  supabase: SupabaseClient,
  boardId: string
): Promise<ExecutionSummaryDto> {
  const { data, error } = await supabase
    .rpc('get_execution_summary', { p_board_id: boardId })
    .single();
  if (error) throw error;

  const row = data as {
    board_id: string;
    reported: number;
    verified: number;
    rejected: number;
    total: number;
  };

  return {
    boardId: row.board_id,
    reported: row.reported,
    verified: row.verified,
    rejected: row.rejected,
    total: row.total,
  };
}
