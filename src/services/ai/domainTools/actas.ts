import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools: la capa intermedia entre el Tool Registry y las RPC
// oficiales. Gemini nunca ve este archivo — solo el Tool Registry, que
// delega aquí. Si mañana compute_acta_totals() o get_pending_billable_work()
// cambian de firma, o se combinan dos RPCs, o se agrega una tercera fuente,
// solo se toca este archivo: el registro de tools y el modelo no se enteran.
//
// Regla: cada función de este archivo devuelve un DTO estable del dominio,
// nunca una fila cruda de RPC/tabla.

export interface ActaTotalsDto {
  actaNumero: number | null;
  estado: string;
  subtotal: number;
  administracion: number;
  imprevistos: number;
  utilidad: number;
  total: number;
}

export async function getActaTotals(
  supabase: SupabaseClient,
  actaId: string
): Promise<ActaTotalsDto> {
  const { data, error } = await supabase
    .rpc('get_acta_summary', { p_acta_id: actaId })
    .single();
  if (error) throw error;

  const row = data as {
    numero: number | null;
    estado: string;
    subtotal: number;
    administracion: number;
    imprevistos: number;
    utilidad: number;
    total_pagar: number;
  };

  return {
    actaNumero: row.numero,
    estado: row.estado,
    subtotal: row.subtotal,
    administracion: row.administracion,
    imprevistos: row.imprevistos,
    utilidad: row.utilidad,
    total: row.total_pagar,
  };
}

export interface PendingBillableWorkDto {
  activities: number;
  executions: number;
  estimatedValue: number;
  currency: string;
}

export async function getPendingBillableWork(
  supabase: SupabaseClient,
  boardId: string
): Promise<PendingBillableWorkDto> {
  const { data, error } = await supabase
    .rpc('get_pending_billable_work', { p_board_id: boardId })
    .single();
  if (error) throw error;

  const row = data as {
    activities: number;
    executions: number;
    estimated_value: number;
    currency: string;
  };

  return {
    activities: row.activities,
    executions: row.executions,
    estimatedValue: row.estimated_value,
    currency: row.currency,
  };
}
