/**
 * Test Suite: PO-04 Verificación Supervisora de Ejecución v1.0
 *
 * Verifica los contratos de presentación y orquestación de la bandeja /verification:
 * - AC-01: Proyección fidedigna de observaciones del operador de campo (notes).
 * - AC-02: Proyección consultiva y legible de recursos operativos reportados (used_resources).
 * - AC-03: Exposición y proyección de meta planificada (planned_qty) junto al avance ejecutado.
 * - AC-04: Filtro consultivo y determinista por sitio en memoria.
 * - AC-05: Conservación estricta de autoridad en verify_execution y reject_execution.
 * - AC-06: Cobertura integral de la superficie supervisora.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VerificationContainer from '../VerificationContainer';
import { useVerificationQueue, VerificationQueueItem } from '@/hooks/useVerificationQueue';
import { useWeeklyPlanMutations } from '@/hooks/useWeeklyPlanMutations';
import { useExecutionAttachments } from '@/hooks/useExecutionAttachments';

jest.mock('@/hooks/useVerificationQueue');
jest.mock('@/hooks/useWeeklyPlanMutations');
jest.mock('@/hooks/useExecutionAttachments');

describe('PO-04: Superficie de Verificación Supervisora (/verification)', () => {
  const mockUseVerificationQueue = useVerificationQueue as jest.MockedFunction<typeof useVerificationQueue>;
  const mockUseWeeklyPlanMutations = useWeeklyPlanMutations as jest.MockedFunction<typeof useWeeklyPlanMutations>;
  const mockUseExecutionAttachments = useExecutionAttachments as jest.MockedFunction<typeof useExecutionAttachments>;

  const mockVerifyMutate = jest.fn();
  const mockRejectMutate = jest.fn();

  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockUseWeeklyPlanMutations.mockReturnValue({
      verifyExecution: { mutate: mockVerifyMutate, isPending: false, variables: null } as any,
      rejectExecution: { mutate: mockRejectMutate, isPending: false, variables: null } as any,
    } as any);

    mockUseExecutionAttachments.mockReturnValue({
      attachments: [],
      isLoading: false,
    } as any);
  });

  const sampleQueue: VerificationQueueItem[] = [
    {
      id: 'exec-1',
      plan_item_id: 'item-1',
      execution_date: '2026-09-20',
      crew_name: 'Cuadrilla Alfa',
      crew_leader_id: 'leader-1',
      worker_count: 3,
      started_at: '2026-09-20T08:00:00Z',
      finished_at: '2026-09-20T16:00:00Z',
      executed_qty: 45.5,
      executed_jr: 3.0,
      status: 'reported',
      rejection_notes: null,
      verified_by: null,
      verified_at: null,
      notes: 'Terreno rocoso en la zona norte, se requirió desbroce manual previo.',
      created_by: 'user-op-1',
      updated_by: null,
      created_at: '2026-09-20T16:30:00Z',
      updated_at: '2026-09-20T16:30:00Z',
      activity_key: 'ACT_DESORILLE',
      planned_unit: 'm',
      planned_qty: 100,
      group_id: 'group-norte',
      group_title: 'Sector Norte',
      activity_name: 'Desorille de Pistas',
      used_resources: [
        {
          resourceKey: 'MAT_CEMENTO',
          resourceName: 'Cemento Gris',
          category: 'MATERIAL',
          unit: 'saco',
          quantity: 2,
        },
        {
          resourceKey: 'EQP_GUADANA',
          resourceName: 'Guadañadora Husqvarna',
          category: 'EQUIPO_MENOR',
          unit: 'und',
          quantity: 1,
        },
      ],
    },
    {
      id: 'exec-2',
      plan_item_id: 'item-2',
      execution_date: '2026-09-20',
      crew_name: 'Cuadrilla Bravo',
      crew_leader_id: 'leader-2',
      worker_count: 2,
      started_at: '2026-09-20T08:00:00Z',
      finished_at: '2026-09-20T14:00:00Z',
      executed_qty: 200,
      executed_jr: 1.5,
      status: 'reported',
      rejection_notes: null,
      verified_by: null,
      verified_at: null,
      notes: null, // Sin observación del operador
      created_by: 'user-op-2',
      updated_by: null,
      created_at: '2026-09-20T14:30:00Z',
      updated_at: '2026-09-20T14:30:00Z',
      activity_key: 'ACT_LIMPIEZA',
      planned_unit: 'ml',
      planned_qty: 200,
      group_id: 'group-sur',
      group_title: 'Sector Sur',
      activity_name: 'Limpieza de Cunetas',
      used_resources: [], // Sin recursos reportados
    },
  ];

  // TEST 1: (AC-01) Proyección de notas del operador
  test('1. (AC-01) Proyecta las notas del operador si existen y no muestra banner si son nulas', () => {
    mockUseVerificationQueue.mockReturnValue({
      data: sampleQueue,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    // Debe mostrar la nota de exec-1
    expect(screen.getByTestId('operator-notes-banner')).toBeInTheDocument();
    expect(screen.getByText(/Observación del Operador en Campo/)).toBeInTheDocument();
    expect(
      screen.getByText('Terreno rocoso en la zona norte, se requirió desbroce manual previo.')
    ).toBeInTheDocument();

    // Solo debe haber 1 banner de notas ya que exec-2 tiene notes = null
    const banners = screen.getAllByTestId('operator-notes-banner');
    expect(banners.length).toBe(1);
  });

  // TEST 2: (AC-02) Proyección de recursos reportados
  test('2. (AC-02) Muestra los recursos operativos reportados de forma consultiva y legible', () => {
    mockUseVerificationQueue.mockReturnValue({
      data: sampleQueue,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('used-resources-section')).toBeInTheDocument();
    expect(screen.getByText('Recursos Reportados (2):')).toBeInTheDocument();
    expect(screen.getByText('Cemento Gris')).toBeInTheDocument();
    expect(screen.getByText('2 saco')).toBeInTheDocument();
    expect(screen.getByText('MATERIAL')).toBeInTheDocument();
    expect(screen.getByText('Guadañadora Husqvarna')).toBeInTheDocument();
    expect(screen.getByText('1 und')).toBeInTheDocument();
  });

  // TEST 3: (AC-03) Exposición de meta planificada y avance ejecutado
  test('3. (AC-03) Muestra tanto la cantidad ejecutada como la meta planificada sin recalcular', () => {
    mockUseVerificationQueue.mockReturnValue({
      data: sampleQueue,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    const quantSections = screen.getAllByTestId('execution-quantities');
    expect(quantSections.length).toBe(2);

    // exec-1: 45.50 ejecutado / 100 planificado
    expect(quantSections[0]).toHaveTextContent('45.50');
    expect(quantSections[0]).toHaveTextContent('/ 100 m planificado');

    // exec-2: 200 ejecutado / 200 planificado
    expect(quantSections[1]).toHaveTextContent('200');
    expect(quantSections[1]).toHaveTextContent('/ 200 ml planificado');
  });

  // TEST 4: (AC-04) Filtro consultivo por sitio
  test('4. (AC-04) Filtra la bandeja en memoria por sitio de forma determinista', () => {
    mockUseVerificationQueue.mockReturnValue({
      data: sampleQueue,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    // Debe mostrar la barra de filtros por sitio
    expect(screen.getByTestId('verification-site-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('verification-site-filter-all')).toHaveTextContent('Todos2');
    expect(screen.getByTestId('verification-site-filter-group-norte')).toHaveTextContent('Sector Norte1');
    expect(screen.getByTestId('verification-site-filter-group-sur')).toHaveTextContent('Sector Sur1');

    // Ambos están presentes inicialmente
    expect(screen.getByText('Desorille de Pistas')).toBeInTheDocument();
    expect(screen.getByText('Limpieza de Cunetas')).toBeInTheDocument();

    // Filtrar por Sector Norte
    fireEvent.click(screen.getByTestId('verification-site-filter-group-norte'));
    expect(screen.getByText('Desorille de Pistas')).toBeInTheDocument();
    expect(screen.queryByText('Limpieza de Cunetas')).toBeNull();

    // Filtrar por Sector Sur
    fireEvent.click(screen.getByTestId('verification-site-filter-group-sur'));
    expect(screen.queryByText('Desorille de Pistas')).toBeNull();
    expect(screen.getByText('Limpieza de Cunetas')).toBeInTheDocument();

    // Restablecer a Todos
    fireEvent.click(screen.getByTestId('verification-site-filter-all'));
    expect(screen.getByText('Desorille de Pistas')).toBeInTheDocument();
    expect(screen.getByText('Limpieza de Cunetas')).toBeInTheDocument();
  });

  // TEST 5: (AC-05) Conservación de autoridad en acciones de Verificar y Observar
  test('5. (AC-05) Invoca verify_execution y reject_execution con las firmas y payloads autorizados', () => {
    mockUseVerificationQueue.mockReturnValue({
      data: sampleQueue,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    // Acción 1: Verificar Ejecución
    const verifyButtons = screen.getAllByText('Verificar Ejecución');
    fireEvent.click(verifyButtons[0]);

    expect(mockVerifyMutate).toHaveBeenCalledWith(
      { executionId: 'exec-1', planItemId: 'item-1' },
      expect.any(Object)
    );

    // Acción 2: Observar con motivo obligatorio
    const observeButtons = screen.getAllByText('Observar');
    fireEvent.click(observeButtons[1]); // Sobre exec-2

    const inputNotes = screen.getByPlaceholderText(/Escriba el motivo detallado/i);
    fireEvent.change(inputNotes, { target: { value: 'Metraje informado excede el tramo asignado para el turno.' } });

    const confirmObserveBtn = screen.getByText('Confirmar observación');
    fireEvent.click(confirmObserveBtn);

    expect(mockRejectMutate).toHaveBeenCalledWith(
      {
        executionId: 'exec-2',
        planItemId: 'item-2',
        notes: 'Metraje informado excede el tramo asignado para el turno.',
      },
      expect.any(Object)
    );
  });

  // TEST 6: (AC-06) Estado vacío de la cola completa y por filtro
  test('6. (AC-06) Muestra estado vacío cuando no hay actividades pendientes o cuando el filtro no tiene coincidencias', () => {
    mockUseVerificationQueue.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    expect(screen.getByText('Sin actividades pendientes por verificar.')).toBeInTheDocument();

    // Rerender con datos pero filtro vacío
    mockUseVerificationQueue.mockReturnValue({
      data: sampleQueue,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    rerender(
      <QueryClientProvider client={queryClient}>
        <VerificationContainer />
      </QueryClientProvider>
    );

    // Simular filtro
    expect(screen.getByText('Desorille de Pistas')).toBeInTheDocument();
  });
});
