import type { UserBoardSummary } from '@/hooks/useUserBoards';

// Decisión pura de navegación cuando /dashboard se abre sin ?boardId= en la
// URL. Reemplaza el fallback "board más reciente de toda la base" (bug de
// navegación 2026-07-19: un usuario real, dueño de su propio board, quedó
// viendo un board de pruebas ajeno sin ningún indicio de qué había pasado).
//
// Reglas (pedidas explícitamente por el usuario):
//   0 boards  -> estado vacío, nunca un board arbitrario.
//   1 board   -> redirect automático, sin fricción.
//   N boards  -> recordar el último usado si sigue siendo accesible;
//                si no, mostrar un selector explícito.
export type BoardNavigationDecision =
  | { action: 'empty' }
  | { action: 'redirect'; boardId: string }
  | { action: 'select'; boards: UserBoardSummary[] };

export function resolveBoardNavigation(
  boards: UserBoardSummary[],
  lastUsedBoardId: string | null,
): BoardNavigationDecision {
  if (boards.length === 0) return { action: 'empty' };
  if (boards.length === 1) return { action: 'redirect', boardId: boards[0].id };

  const lastUsedStillAccessible = lastUsedBoardId && boards.some((b) => b.id === lastUsedBoardId);
  if (lastUsedStillAccessible) return { action: 'redirect', boardId: lastUsedBoardId! };

  return { action: 'select', boards };
}
