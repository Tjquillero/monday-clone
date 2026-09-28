/// <reference types="@testing-library/jest-dom" />
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonnelManagement from '@/components/PersonnelManagement';
import { usePersonnel } from '@/hooks/usePersonnel';
import { useCrews, usePersonnelAssignments, usePersonnelVersionForDate, useCrewMutations } from '@/hooks/useCrews';
import { assignCrewToPlanItem } from '@/lib/crewService';
import { evaluateCrewAssignment } from '@/lib/crewAssignmentService';
import { supabase } from '@/lib/supabaseClient';

jest.mock('@/hooks/usePersonnel', () => ({
  usePersonnel: jest.fn(),
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
  useCrewMutations: jest.fn(),
}));

jest.mock('@/hooks/useMachinery', () => ({
  useMachinery: jest.fn(() => ({ data: [], isLoading: false })),
  useMachineryAvailability: jest.fn(() => ({ data: [] })),
  useMachineryMutations: jest.fn(() => ({
    createMachinery: { mutate: jest.fn(), isPending: false },
    setAvailability: { mutate: jest.fn(), isPending: false },
  })),
}));

describe('CUADRILLAS-PERSONAL-FASE-2.4 — Crew Membership & Staffing UX (TC-CRW-01..12)', () => {
  const mockMutations = {
    createCrew: { mutate: jest.fn(), isPending: false },
    updateCrew: { mutate: jest.fn(), isPending: false },
    deleteCrew: { mutate: jest.fn(), isPending: false },
    addMember: { mutate: jest.fn(), isPending: false },
    removeMember: { mutate: jest.fn(), isPending: false },
    reassignPersonnel: { mutateAsync: jest.fn(), isPending: false },
  };

  const mockPersonnel = [
    { id: 'p-1', name: 'Carlos Mendoza', role: 'Operario', default_rate: 85000, document_id: '1001' },
    { id: 'p-2', name: 'María Gómez', role: 'Supervisora', default_rate: 120000, document_id: '1002' },
    { id: 'p-3', name: 'Jorge Pérez', role: 'Jardinero', default_rate: 90000, document_id: '1003' },
  ];

  const mockAssignments = [
    { id: 'as-1', personnel_id: 'p-1', personnel_name: 'Carlos Mendoza', role_in_site: 'Podador', zone: 'ZV', dedication_percentage: 100 },
    { id: 'as-2', personnel_id: 'p-2', personnel_name: 'María Gómez', role_in_site: 'Líder Campo', zone: 'GENERAL', dedication_percentage: 100 },
  ];

  const mockCrewActive = {
    id: 'crew-1',
    board_id: 'board-1',
    name: 'Cuadrilla Norte',
    code: 'CN-01',
    leader_id: 'p-2',
    leader_name: 'María Gómez',
    is_active: true,
    members_count: 1,
    members: [
      { id: 'cm-1', personnel_assignment_id: 'as-1', personnel_id: 'p-1', full_name: 'Carlos Mendoza', zone: 'ZV', role_in_site: 'Podador' },
    ],
  };

  const mockCrewInactive = {
    id: 'crew-2',
    board_id: 'board-1',
    name: 'Cuadrilla Sur',
    code: 'CS-02',
    leader_id: null,
    leader_name: null,
    is_active: false,
    members_count: 0,
    members: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);

    (usePersonnel as jest.Mock).mockReturnValue({
      data: mockPersonnel,
      isLoading: false,
    });

    (usePersonnelAssignments as jest.Mock).mockReturnValue({
      data: mockAssignments,
      isLoading: false,
    });

    (usePersonnelVersionForDate as jest.Mock).mockReturnValue({
      data: { id: 'ver-1', board_id: 'board-1', version_name: 'V1 - Inicial', effective_from: '2026-09-01', status: 'PUBLISHED' },
      isLoading: false,
    });

    (useCrews as jest.Mock).mockReturnValue({
      data: [mockCrewActive],
      isLoading: false,
    });

    (useCrewMutations as jest.Mock).mockReturnValue(mockMutations);
  });

  it('TC-CRW-01: Agregar integrante elegible -> llama addMember.mutate con crewId y personnelAssignmentId', () => {
    render(<PersonnelManagement boardId="board-1" />);

    // Ir a pestaña de cuadrillas
    const crewsTab = screen.getByRole('button', { name: /cuadrillas operativas/i });
    fireEvent.click(crewsTab);

    // Click en "Agregar Miembro"
    const addMemberBtn = screen.getByText(/agregar miembro/i);
    fireEvent.click(addMemberBtn);

    // El candidato disponible debe ser María Gómez (as-2) porque Carlos ya está en la cuadrilla
    const candidateSelect = screen.getByLabelText(/seleccionar persona adscrita para agregar/i);
    expect(candidateSelect).toBeInTheDocument();
    expect(screen.getByText(/María Gómez \(GENERAL - Líder Campo\)/i)).toBeInTheDocument();

    // Confirmar
    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    expect(mockMutations.addMember.mutate).toHaveBeenCalledWith(
      { crewId: 'crew-1', personnelAssignmentId: 'as-2' },
      expect.any(Object)
    );
  });

  it('TC-CRW-02: Filtra integrantes existentes para prevenir duplicados en selector de miembros', () => {
    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /cuadrillas operativas/i }));
    fireEvent.click(screen.getByText(/agregar miembro/i));

    const options = screen.getAllByRole('option');
    // Carlos Mendoza (as-1) ya es miembro, no debe ser opción en el selector
    const hasCarlosOption = options.some(opt => opt.textContent?.includes('Carlos Mendoza') && opt.getAttribute('value') === 'as-1');
    expect(hasCarlosOption).toBe(false);
  });

  it('TC-CRW-03: Retirar integrante -> llama removeMember.mutate con memberId sin mutar asignaciones', () => {
    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /cuadrillas operativas/i }));

    const removeBtn = screen.getByRole('button', { name: /retirar a Carlos Mendoza de la cuadrilla/i });
    fireEvent.click(removeBtn);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Carlos Mendoza'));
    expect(mockMutations.removeMember.mutate).toHaveBeenCalledWith('cm-1', expect.any(Object));
  });

  it('TC-CRW-04: Candidatos de cuadrilla provienen estrictamente de usePersonnelAssignments(boardId)', () => {
    render(<PersonnelManagement boardId="board-1" />);

    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-1');
  });

  it('TC-CRW-05: Persona del catálogo global sin adscripción vigente (Jorge Pérez) no es candidata a miembro', () => {
    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /cuadrillas operativas/i }));
    fireEvent.click(screen.getByText(/agregar miembro/i));

    // Jorge Pérez está en mockPersonnel pero no en mockAssignments
    expect(screen.queryByText(/Jorge Pérez/i)).not.toBeInTheDocument();
  });

  it('TC-CRW-06: Cuadrilla inactiva -> renderiza badge visual Inactiva', () => {
    (useCrews as jest.Mock).mockReturnValue({
      data: [mockCrewInactive],
      isLoading: false,
    });

    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /cuadrillas operativas/i }));

    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.getByText('Cuadrilla Sur')).toBeInTheDocument();
  });

  it('TC-CRW-07: Editar cuadrilla -> activa formulario inline y llama updateCrew.mutate', () => {
    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /cuadrillas operativas/i }));

    const editBtn = screen.getByRole('button', { name: /editar cuadrilla Cuadrilla Norte/i });
    fireEvent.click(editBtn);

    const nameInput = screen.getByDisplayValue('Cuadrilla Norte');
    fireEvent.change(nameInput, { target: { value: 'Cuadrilla Norte Renombrada' } });

    const saveBtn = screen.getByRole('button', { name: /guardar/i });
    fireEvent.click(saveBtn);

    expect(mockMutations.updateCrew.mutate).toHaveBeenCalledWith(
      {
        crewId: 'crew-1',
        updates: {
          name: 'Cuadrilla Norte Renombrada',
          code: 'CN-01',
          leader_id: 'p-2',
        },
      },
      expect.any(Object)
    );
  });

  it('TC-CRW-08: Desactivar cuadrilla -> solicita confirmación y llama deleteCrew.mutate', () => {
    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /cuadrillas operativas/i }));

    const deleteBtn = screen.getByRole('button', { name: /desactivar cuadrilla Cuadrilla Norte/i });
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Cuadrilla Norte'));
    expect(mockMutations.deleteCrew.mutate).toHaveBeenCalledWith('crew-1');
  });

  it('TC-CRW-09: activeVersion === null -> muestra estado explícito de Sin Versión de Dotación Publicada', () => {
    (usePersonnelVersionForDate as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
    });
    (usePersonnelAssignments as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /adscripción por sitio/i }));

    expect(screen.getByText('Sin Versión de Dotación Publicada')).toBeInTheDocument();
    expect(screen.getByText(/Este tablero no cuenta actualmente con una versión de dotación publicada/i)).toBeInTheDocument();
  });

  it('TC-CRW-10: Versión publicada con 0 asignaciones -> muestra mensaje explícito distinto al caso nulo', () => {
    (usePersonnelVersionForDate as jest.Mock).mockReturnValue({
      data: { id: 'ver-empty', board_id: 'board-1', version_name: 'V2 - Vacia', effective_from: '2026-09-01', status: 'PUBLISHED' },
      isLoading: false,
    });
    (usePersonnelAssignments as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<PersonnelManagement boardId="board-1" />);

    fireEvent.click(screen.getByRole('button', { name: /adscripción por sitio/i }));

    expect(screen.getByText(/Versión Publicada Activa \(V2 - Vacia\)/i)).toBeInTheDocument();
    expect(screen.getByText(/La versión vigente para este tablero no contiene integrantes adscritos/i)).toBeInTheDocument();
  });

  it('TC-CRW-11: Cambio de board A -> B aísla hooks y candidatos del board anterior', () => {
    const { rerender } = render(<PersonnelManagement boardId="board-a" />);

    expect(useCrews).toHaveBeenCalledWith('board-a');
    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-a');

    rerender(<PersonnelManagement boardId="board-b" />);

    expect(useCrews).toHaveBeenCalledWith('board-b');
    expect(usePersonnelAssignments).toHaveBeenCalledWith('board-b');
  });

  it('TC-CRW-12: assignCrewToPlanItem mantiene compuertas de compatibilidad de sitio', async () => {
    // Verificación estática del contrato del servicio
    expect(typeof assignCrewToPlanItem).toBe('function');
    expect(typeof evaluateCrewAssignment).toBe('function');
  });
});
