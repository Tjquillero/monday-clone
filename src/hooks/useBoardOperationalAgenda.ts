'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { BoardOperationalAgenda } from '@/types/scheduler';

// ─────────────────────────────────────────────────────────────────────────────
// useBoardOperationalAgenda
//
// Superficie de la Agenda Operativa (ADR-0006 / docs/architecture/
// agenda-operativa-design.md, Fase 1 — vista Hoy). Consumidor puro de
// get_board_operational_agenda: sin joins, sin agregación, sin recálculo en
// TypeScript. El semáforo, los conteos y los gates de confirmar/cerrar viven
// en SQL — este hook solo pide la RPC y expone su única fila de respuesta.
// ─────────────────────────────────────────────────────────────────────────────

export const boardAgendaKeys = {
  today: (boardId: string) => ['board_operational_agenda', boardId] as const,
};

export function useBoardOperationalAgenda(boardId: string | undefined) {
  return useQuery<BoardOperationalAgenda>({
    queryKey: boardAgendaKeys.today(boardId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_board_operational_agenda', {
        p_board_id: boardId!,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) throw new Error('No se pudo calcular la agenda operativa del board.');
      return row as BoardOperationalAgenda;
    },
    enabled: !!boardId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
