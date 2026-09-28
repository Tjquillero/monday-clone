/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanningPage from '../page';
import PersonnelManagement from '@/components/PersonnelManagement';
import { useUserBoards, type UserBoardSummary } from '@/hooks/useUserBoards';
import { usePersonnel } from '@/hooks/usePersonnel';
import { useCrews, usePersonnelAssignments, usePersonnelVersionForDate } from '@/hooks/useCrews';
import { useMachinery } from '@/hooks/useMachinery';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearchParamsGet = jest.fn((key: string) => null as string | null);

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
    toString: () => '',
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-123', email: 'test@example.com' },
  })),
}));

jest.mock('@/hooks/useUserBoards', () => ({
  useUserBoards: jest.fn(),
}));

jest.mock('@/hooks/usePersonnel', () => ({
  usePersonnel: jest.fn(() => ({
    data: [
      { id: 'p-1', name: 'Carlos Mendoza', role: 'Operario', default_rate: 85000, document_id: '1001' },
      { id: 'p-2', name: 'María Gómez', role: 'Supervisora', default_rate: 120000, document_id: '1002' },
    ],
    isLoading: false,
  })),
  usePersonnelMutations: jest.fn(() => ({
    createPersonnel: { mutate: jest.fn(), isPending: false },
    updatePersonnel: { mutate: jest.fn(), isPending: false },
    deletePersonnel: { mutate: jest.fn(), isPending: false },
  })),
}));

jest.mock('@/hooks/useCrews', () => ({
  useCrews: jest.fn(),
  usePersonnelAssignments: jest.fn(),
  usePersonnelVersionForDate: jest.fn(),
  useCrewMutations: jest.fn(() => ({
    createCrew: { mutate: jest.fn(), isPending: false },
    updateCrew: { mutate: jest.fn(), isPending: false },
    deleteCrew: { mutate: jest.fn(), isPending: false },
    reassignPersonnel: { mutateAsync: jest.fn(), isPending: false },
  })),
}));

jest.mock('@/hooks/useMachinery', () => ({
  useMachinery: jest.fn(),
  useMachineryAvailability: jest.fn(() => ({ data: [] })),
  useMachineryMutations: jest.fn(() => ({
    createMachinery: { mutate: jest.fn(), isPending: false },
    setAvailability: { mutate: jest.fn(), isPending: false },
  })),
}));

const mockBoardA: UserBoardSummary = { id: 'board-a', name: 'Parque Metropolitano' };
const mockBoardB: UserBoardSummary = { id: 'board-b', name: 'Malecón Costero' };

describe('CUADRILLAS-PERSONAL-FASE-2.2 — Board Context Integration (TC-BRD-01..11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsGet = jest.fn((key: string) => null);
    window.localStorage.clear();

    (useCrews as jest.Mock).mockImplementation((boardId) => ({
      data: boardId ? [{ id: 'crew-1', name: 'Cuadrilla Norte', board_id: boardId, is_active: true }] : [],
      isLoading: false,
    }));

    (usePersonnelAssignments as jest.Mock).mockImplementation((boardId) => ({
      data: boardId
        ? [{ id: 'assign-1', personnel_id: 'p-1', personnel_name: 'Carlos Mendoza', role_in_site: 'Podador', zone: 'ZV', dedication_percentage: 100 }]
        : [],
      isLoading: false,
    }));

    (usePersonnelVersionForDate as jest.Mock).mockImplementation((boardId) => ({
      data: boardId ? { id: 'v-1', board_id: boardId, status: 'PUBLISHED', is_active: true } : null,
      isLoading: false,
    }));

    (useMachinery as jest.Mock).mockImplementation((boardId) => ({
      data: boardId
        ? [{ id: 'mach-1', code: 'TR-01', name: 'Tractor 1', category: 'TRACTOR', isAvailable: true }]
        : [],
      isLoading: false,
    }));
  });

  it('TC-BRD-01: boardId válido y autorizado en URL -> PlanningPage y PersonnelManagement reciben el UUID correcto', () => {
    mockSearchParamsGet.mockImplementation((key) => (key === 'boardId' ? 'board-a' : null));
    (useUserBoards as jest.Mock).mockReturnValue({
      data: [mockBoardA, mockBoardB],
      isLoading: false,
    });

    render(<PlanningPage />);

    expect(screen.getByText('Directorio y Dotación')).toBeInTheDocument();
    expect(screen.getByText('Parque Metropolitano')).toBeInTheDocument();
    expect(useCrews).toHaveBeenCalledWith('board-a');
    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-a');
    expect(useMachinery).toHaveBeenCalledWith('board-a');
  });

  it('TC-BRD-02: boardId ausente + 1 único board autorizado -> autoselección / redirect', () => {
    mockSearchParamsGet.mockImplementation(() => null);
    (useUserBoards as jest.Mock).mockReturnValue({
      data: [mockBoardA],
      isLoading: false,
    });

    render(<PlanningPage />);

    expect(mockReplace).toHaveBeenCalledWith('/projects?boardId=board-a');
  });

  it('TC-BRD-03: múltiples boards autorizados + ausencia de boardId -> muestra selector de board (BoardSelector)', () => {
    mockSearchParamsGet.mockImplementation(() => null);
    (useUserBoards as jest.Mock).mockReturnValue({
      data: [mockBoardA, mockBoardB],
      isLoading: false,
    });

    render(<PlanningPage />);

    expect(screen.getByText('Selecciona un tablero')).toBeInTheDocument();
    expect(screen.getByText('Parque Metropolitano')).toBeInTheDocument();
    expect(screen.getByText('Malecón Costero')).toBeInTheDocument();
  });

  it('TC-BRD-04: boardId inválido en URL -> no habilita datos y activa resolución canónica', () => {
    mockSearchParamsGet.mockImplementation((key) => (key === 'boardId' ? 'board-inexistente-xyz' : null));
    (useUserBoards as jest.Mock).mockReturnValue({
      data: [mockBoardA, mockBoardB],
      isLoading: false,
    });

    render(<PlanningPage />);

    // Al no ser un board autorizado, cae al selector de tablero
    expect(screen.getByText('Selecciona un tablero')).toBeInTheDocument();
    expect(useCrews).not.toHaveBeenCalledWith('board-inexistente-xyz');
  });

  it('TC-BRD-05: boardId no autorizado (tablero ajeno al usuario) -> rechazado por la compuerta RBAC', () => {
    mockSearchParamsGet.mockImplementation((key) => (key === 'boardId' ? 'board-ajeno-999' : null));
    (useUserBoards as jest.Mock).mockReturnValue({
      data: [mockBoardA],
      isLoading: false,
    });

    render(<PlanningPage />);

    // Redirige al único board autorizado del usuario
    expect(mockReplace).toHaveBeenCalledWith('/projects?boardId=board-a');
  });

  it('TC-BRD-06: cambio de board mediante selector en cabecera -> actualiza navegación sin mutación de DB', () => {
    mockSearchParamsGet.mockImplementation((key) => (key === 'boardId' ? 'board-a' : null));
    (useUserBoards as jest.Mock).mockReturnValue({
      data: [mockBoardA, mockBoardB],
      isLoading: false,
    });

    render(<PlanningPage />);

    const select = screen.getByLabelText('Seleccionar tablero operativo');
    fireEvent.change(select, { target: { value: 'board-b' } });

    expect(mockPush).toHaveBeenCalledWith('/projects?boardId=board-b');
    expect(window.localStorage.getItem('mantenix_last_board_id')).toBe('board-b');
  });

  it('TC-BRD-07: Adscripciones -> usePersonnelAssignments recibe boardId correctamente', () => {
    render(<PersonnelManagement boardId="board-a" />);

    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-a');
  });

  it('TC-BRD-08: Cuadrillas -> useCrews recibe boardId correctamente', () => {
    render(<PersonnelManagement boardId="board-a" />);

    expect(useCrews).toHaveBeenCalledWith('board-a');
  });

  it('TC-BRD-09: Maquinaria -> useMachinery recibe boardId correctamente', () => {
    render(<PersonnelManagement boardId="board-a" />);

    expect(useMachinery).toHaveBeenCalledWith('board-a');
  });

  it('TC-BRD-10: Personas -> continúa funcionando como catálogo global sin depender de boardId', () => {
    render(<PersonnelManagement boardId={undefined} />);

    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    expect(screen.getByText('María Gómez')).toBeInTheDocument();
    expect(usePersonnel).toHaveBeenCalled();
  });

  it('TC-BRD-11: Cambio de board A -> B aísla queries y evita datos residuales de A mientras carga B', () => {
    const { rerender } = render(<PersonnelManagement boardId="board-a" />);

    expect(useCrews).toHaveBeenCalledWith('board-a');
    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-a');

    // Cambiar a board-b con estado de carga activo
    (useCrews as jest.Mock).mockImplementation((boardId) => ({
      data: boardId === 'board-b' ? [] : [{ id: 'crew-1', name: 'Cuadrilla Norte' }],
      isLoading: boardId === 'board-b',
    }));

    (usePersonnelAssignments as jest.Mock).mockImplementation((boardId) => ({
      data: boardId === 'board-b' ? [] : [{ id: 'assign-1', personnel_name: 'Carlos Mendoza' }],
      isLoading: boardId === 'board-b',
    }));

    rerender(<PersonnelManagement boardId="board-b" />);

    expect(useCrews).toHaveBeenCalledWith('board-b');
    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-b');
  });
});
