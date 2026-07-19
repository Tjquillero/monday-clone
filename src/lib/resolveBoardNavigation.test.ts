import { resolveBoardNavigation } from './resolveBoardNavigation';
import type { UserBoardSummary } from '@/hooks/useUserBoards';

// Congela la regla de navegación inicial (2026-07-19, ver dashboard/page.tsx):
// /dashboard sin boardId NUNCA adivina un board arbitrario — reemplaza el
// bug real donde useBoard() caía en "el board más recientemente creado en
// toda la base", exponiendo el board de otro usuario.

const BOARD_A: UserBoardSummary = { id: 'board-a', name: 'Tablero A' };
const BOARD_B: UserBoardSummary = { id: 'board-b', name: 'Tablero B' };

describe('resolveBoardNavigation', () => {
  it('0 boards -> estado vacío, nunca un board arbitrario', () => {
    expect(resolveBoardNavigation([], null)).toEqual({ action: 'empty' });
  });

  it('1 board -> redirect automático a ese board, sin fricción', () => {
    expect(resolveBoardNavigation([BOARD_A], null)).toEqual({ action: 'redirect', boardId: 'board-a' });
  });

  it('1 board -> redirect ignora cualquier lastUsedBoardId (solo hay una opción real)', () => {
    expect(resolveBoardNavigation([BOARD_A], 'board-x')).toEqual({ action: 'redirect', boardId: 'board-a' });
  });

  it('N boards sin último usado -> selector explícito con todos los boards', () => {
    expect(resolveBoardNavigation([BOARD_A, BOARD_B], null)).toEqual({
      action: 'select',
      boards: [BOARD_A, BOARD_B],
    });
  });

  it('N boards con último usado todavía accesible -> redirect a ese, sin mostrar selector', () => {
    expect(resolveBoardNavigation([BOARD_A, BOARD_B], 'board-b')).toEqual({ action: 'redirect', boardId: 'board-b' });
  });

  it('N boards con último usado YA NO accesible (ej. se quitó la membresía) -> selector, no un board fantasma', () => {
    expect(resolveBoardNavigation([BOARD_A, BOARD_B], 'board-eliminado')).toEqual({
      action: 'select',
      boards: [BOARD_A, BOARD_B],
    });
  });
});
