'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// useUserBoards
//
// Boards donde el usuario autenticado es miembro real (board_members) —
// fuente única para decidir la navegación inicial de /dashboard cuando no
// hay boardId en la URL (ver dashboard/page.tsx). Deliberadamente NO usa
// boards.owner_id como atajo: la navegación debe reflejar exactamente lo
// mismo que get_user_board_role() exige en el resto del sistema — ser
// owner_id sin fila en board_members es precisamente el estado que causó
// el bug de navegación de 2026-07-19 (dueño real de un board sin poder
// entrar a sus propias pantallas nuevas).
// ─────────────────────────────────────────────────────────────────────────────

export interface UserBoardSummary {
  id: string;
  name: string;
}

export function useUserBoards(userId: string | undefined) {
  return useQuery({
    queryKey: ['user_boards', userId],
    queryFn: async (): Promise<UserBoardSummary[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('board_members')
        .select('boards ( id, name )')
        .eq('user_id', userId);

      if (error) throw error;

      const rows = (data ?? []) as unknown as { boards: UserBoardSummary | null }[];
      return rows
        .map((row) => row.boards)
        .filter((b): b is UserBoardSummary => !!b)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
