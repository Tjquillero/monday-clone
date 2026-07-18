'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { BoardOperationalAgenda, BoardOperationalAgendaWeek } from '@/types/scheduler';

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
  week: (boardId: string) => ['board_operational_agenda_week', boardId] as const,
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

// ─────────────────────────────────────────────────────────────────────────────
// useBoardOperationalAgendaWeek
//
// Vista Semana (Fase 2). Consumidor puro de get_board_operational_agenda_week
// — mismo principio: sin joins ni recálculo en TypeScript. `enabled` aparte de
// `!!boardId` para no pedir esta RPC hasta que el usuario abra la pestaña
// Semana (evita una llamada innecesaria en el caso común, que es Hoy).
// ─────────────────────────────────────────────────────────────────────────────

export function useBoardOperationalAgendaWeek(boardId: string | undefined, enabled: boolean) {
  return useQuery<BoardOperationalAgendaWeek>({
    queryKey: boardAgendaKeys.week(boardId!),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_board_operational_agenda_week', {
        p_board_id: boardId!,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      if (!row) throw new Error('No se pudo calcular la agenda operativa semanal del board.');
      return row as BoardOperationalAgendaWeek;
    },
    enabled: !!boardId && enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
