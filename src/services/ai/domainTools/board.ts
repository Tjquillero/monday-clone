import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools de tablero — ver src/services/ai/domainTools/actas.ts para la
// explicación general de esta capa (Tool Registry -> DomainTools -> RPC).

export interface BoardSummaryDto {
  boardId: string;
  boardName: string;
  activePoaVersion: number | null;
  contractedValue: number;
  certifiedValue: number;
  contractProgress: number;
  draftActas: number;
  issuedActas: number;
  pendingBillableValue: number;
  currency: string;
}

export async function getBoardSummary(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardSummaryDto> {
  const { data, error } = await supabase
    .rpc('get_board_summary', { p_board_id: boardId })
    .single();
  if (error) throw error;

  const row = data as {
    board_id: string;
    board_name: string;
    active_poa_version: number | null;
    contracted_value: number;
    certified_value: number;
    contract_progress: number;
    draft_actas: number;
    issued_actas: number;
    pending_billable_value: number;
    currency: string;
  };

  return {
    boardId: row.board_id,
    boardName: row.board_name,
    activePoaVersion: row.active_poa_version,
    contractedValue: row.contracted_value,
    certifiedValue: row.certified_value,
    contractProgress: row.contract_progress,
    draftActas: row.draft_actas,
    issuedActas: row.issued_actas,
    pendingBillableValue: row.pending_billable_value,
    currency: row.currency,
  };
}
