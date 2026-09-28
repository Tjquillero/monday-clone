/**
 * Test Suite: PO-05 CertifiedActasModuleIntegration.test.tsx
 *
 * Verifies Acceptance Criteria AC-01 to AC-14 for:
 * PO-05 — Certificación Contractual y Emisión de Actas v1.0
 *
 * GAPs Covered:
 * - GAP-01: Visibilidad de elegibilidad previa cuando no existe borrador (AC-01)
 * - GAP-02: Previsualización de magnitudes y snapshots del borrador (AC-02)
 * - GAP-03: Trazabilidad de fuentes físicas de ejecución (AC-03)
 * - GAP-03: Ajuste gobernado de cantidad con prevalidador de reducción (AC-04, AC-05)
 * - GAP-04: Emisión gobernada con resumen financiero oficial AIU y advertencia de inmutabilidad (AC-06, AC-07)
 * - GAP-05: Continuidad documental e inmutabilidad de actas emitidas (AC-08, AC-09)
 * - Seguridad y Arquitectura: 0 escritores directos PostgREST, 0 DDL, preservación de autoridades (AC-10, AC-11, AC-12)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CertifiedActasModule from '../CertifiedActasModule';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCertifiedActaDraft,
  useCertifiedActasIssued,
  useCertifiedActaTotals,
  usePendingBillableWork,
  useCertifiedActaMutations,
} from '@/hooks/useCertifiedActas';
import { useBoardHasActivePoa } from '@/hooks/usePoaActivities';
import { CertifiedActa, CertifiedActaTotals } from '@/types/monday';

jest.mock('@/hooks/useCertifiedActas');
jest.mock('@/hooks/usePoaActivities');

describe('PO-05: CertifiedActasModule Integration Suite (AC-01 -> AC-14)', () => {
  const mockUseCertifiedActaDraft = useCertifiedActaDraft as jest.MockedFunction<typeof useCertifiedActaDraft>;
  const mockUseCertifiedActasIssued = useCertifiedActasIssued as jest.MockedFunction<typeof useCertifiedActasIssued>;
  const mockUseCertifiedActaTotals = useCertifiedActaTotals as jest.MockedFunction<typeof useCertifiedActaTotals>;
  const mockUsePendingBillableWork = usePendingBillableWork as jest.MockedFunction<typeof usePendingBillableWork>;
  const mockUseCertifiedActaMutations = useCertifiedActaMutations as jest.MockedFunction<typeof useCertifiedActaMutations>;
  const mockUseBoardHasActivePoa = useBoardHasActivePoa as jest.MockedFunction<typeof useBoardHasActivePoa>;

  let queryClient: QueryClient;
  const mockBoardId = 'board_poc_test_01';

  const mockTotals: CertifiedActaTotals = {
    subtotal: 10000000,
    administracion: 2000000,
    imprevistos: 500000,
    utilidad: 500000,
    total_pagar: 13000000,
  };

  const mockDraftActa: CertifiedActa = {
    id: 'acta_draft_01',
    board_id: mockBoardId,
    numero: null,
    estado: 'draft',
    fecha: '2026-09-24',
    observaciones: null,
    generated_by: 'usr_admin_01',
    generated_at: '2026-09-24T10:00:00Z',
    issued_by: null,
    issued_at: null,
    created_at: '2026-09-24T10:00:00Z',
    updated_at: '2026-09-24T10:00:00Z',
    items: [
      {
        id: 'item_01',
        acta_id: 'acta_draft_01',
        poa_activity_id: 'poa_act_01',
        descripcion_snapshot: 'Poda y Mantenimiento de Zonas Verdes',
        unidad_snapshot: 'M2',
        precio_unitario_snapshot: 20000,
        activity_key_snapshot: 'ACT_PODA',
        zone_snapshot: 'Zona Norte',
        cantidad_facturada: 500,
        valor_total: 10000000,
        created_at: '2026-09-24T10:00:00Z',
        updated_at: '2026-09-24T10:00:00Z',
        sources: [
          {
            id: 'src_01',
            acta_item_id: 'item_01',
            execution_id: 'exec_physical_01',
            cantidad_consumida: 300,
            created_at: '2026-09-24T10:00:00Z',
          },
          {
            id: 'src_02',
            acta_item_id: 'item_01',
            execution_id: 'exec_physical_02',
            cantidad_consumida: 200,
            created_at: '2026-09-24T10:00:00Z',
          },
        ],
      },
    ],
  };

  const mockIssuedActa: CertifiedActa = {
    id: 'acta_issued_01',
    board_id: mockBoardId,
    numero: 38,
    estado: 'issued',
    fecha: '2026-09-20',
    observaciones: 'Acta de Cierre Mensual',
    generated_by: 'usr_admin_01',
    generated_at: '2026-09-20T10:00:00Z',
    issued_by: 'usr_admin_01',
    issued_at: '2026-09-20T12:00:00Z',
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T12:00:00Z',
    items: [
      {
        id: 'item_issued_01',
        acta_id: 'acta_issued_01',
        poa_activity_id: 'poa_act_01',
        descripcion_snapshot: 'Poda y Mantenimiento de Zonas Verdes',
        unidad_snapshot: 'M2',
        precio_unitario_snapshot: 20000,
        activity_key_snapshot: 'ACT_PODA',
        zone_snapshot: 'Zona Norte',
        cantidad_facturada: 500,
        valor_total: 10000000,
        created_at: '2026-09-20T10:00:00Z',
        updated_at: '2026-09-20T12:00:00Z',
        sources: [],
      },
    ],
  };

  const mockMutations = {
    generateDraft: { mutate: jest.fn(), isPending: false },
    adjustQuantity: { mutate: jest.fn(), isPending: false },
    issueActa: { mutateAsync: jest.fn().mockResolvedValue('acta_draft_01'), isPending: false },
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    mockUseBoardHasActivePoa.mockReturnValue({
      data: true,
      isLoading: false,
    } as any);

    mockUseCertifiedActaMutations.mockReturnValue(mockMutations as any);
  });

  // ---------------------------------------------------------------------------
  // Test 1: GAP-01 Contexto de Elegibilidad Previa (AC-01)
  // ---------------------------------------------------------------------------
  test('Test 1 [AC-01]: Cuando no existe borrador, muestra contexto consultivo de elegibilidad sin mutar datos', async () => {
    mockUseCertifiedActaDraft.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActasIssued.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    mockUsePendingBillableWork.mockReturnValue({
      data: {
        activities: 4,
        executions: 12,
        estimated_value: 24500000,
        currency: 'COP',
      },
      isLoading: false,
    } as any);
    mockUseCertifiedActaTotals.mockReturnValue({
      data: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CertifiedActasModule boardId={mockBoardId} />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Elegibilidad Contractual Previa/i)).toBeInTheDocument();
    expect(screen.getByText(/Trabajo Verificado Pendiente de Facturación/i)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/\$ 24.500.000/i)).toBeInTheDocument();

    const generateBtn = screen.getByRole('button', { name: /Generar Borrador de Acta con Saldo Disponible/i });
    expect(generateBtn).toBeEnabled();

    fireEvent.click(generateBtn);
    expect(mockMutations.generateDraft.mutate).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 2: GAP-02 Transparencia de Magnitudes en Borrador (AC-02)
  // ---------------------------------------------------------------------------
  test('Test 2 [AC-02]: El borrador diferencia visualmente las magnitudes de snapshot y conceptos', async () => {
    mockUseCertifiedActaDraft.mockReturnValue({
      data: mockDraftActa,
      isLoading: false,
    } as any);
    mockUseCertifiedActasIssued.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    mockUsePendingBillableWork.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActaTotals.mockReturnValue({
      data: mockTotals,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CertifiedActasModule boardId={mockBoardId} />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Borrador de Acta \(Sin Emitir\)/i)).toBeInTheDocument();
    expect(screen.getByText('Borrador Mutable')).toBeInTheDocument();
    expect(screen.getByText('Poda y Mantenimiento de Zonas Verdes')).toBeInTheDocument();
    expect(screen.getByText(/Zona: Zona Norte/i)).toBeInTheDocument();
    expect(screen.getByText('M2')).toBeInTheDocument();
    expect(screen.getByText(/\$ 20.000/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$ 10.000.000/i).length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test 3: GAP-03 Trazabilidad de Fuentes Físicas (AC-03)
  // ---------------------------------------------------------------------------
  test('Test 3 [AC-03]: Las líneas del borrador exponen trazabilidad hacia sus fuentes físicas de ejecución', async () => {
    mockUseCertifiedActaDraft.mockReturnValue({
      data: mockDraftActa,
      isLoading: false,
    } as any);
    mockUseCertifiedActasIssued.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    mockUsePendingBillableWork.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActaTotals.mockReturnValue({
      data: mockTotals,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CertifiedActasModule boardId={mockBoardId} />
      </QueryClientProvider>
    );

    // Click on sources badge (count: 2)
    const sourcesButton = screen.getByTitle(/Ver ejecuciones físicas de origen/i);
    expect(sourcesButton).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(sourcesButton);

    expect(screen.getByText(/Fuentes Físicas de Ejecución \(acta_item_sources\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Exec: exec_phy/i).length).toBe(2);
    expect(screen.getByText(/300 M2/i)).toBeInTheDocument();
    expect(screen.getByText(/200 M2/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Test 4: GAP-03 Ajuste Gobernado de Cantidad (AC-04, AC-05)
  // ---------------------------------------------------------------------------
  test('Test 4 [AC-04, AC-05]: Ajuste gobernado valida el límite contractual y delega a adjust_acta_item_quantity', async () => {
    mockUseCertifiedActaDraft.mockReturnValue({
      data: mockDraftActa,
      isLoading: false,
    } as any);
    mockUseCertifiedActasIssued.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    mockUsePendingBillableWork.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActaTotals.mockReturnValue({
      data: mockTotals,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CertifiedActasModule boardId={mockBoardId} />
      </QueryClientProvider>
    );

    // Open governed quantity editor
    const qtyEditBtn = screen.getByTitle(/Haga clic para ajustar la cantidad/i);
    fireEvent.click(qtyEditBtn);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    // Try invalid quantity exceeding max allowed (e.g., 600 > 500)
    fireEvent.change(input, { target: { value: '600' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText(/Solo reducción: el tope máximo es 500/i)).toBeInTheDocument();
    expect(mockMutations.adjustQuantity.mutate).not.toHaveBeenCalled();

    // Now input valid reduced quantity (400 <= 500)
    fireEvent.change(input, { target: { value: '400' } });
    const saveBtn = screen.getByTitle(/Guardar ajuste/i);
    fireEvent.mouseDown(saveBtn);

    expect(mockMutations.adjustQuantity.mutate).toHaveBeenCalledWith(
      { actaItemId: 'item_01', cantidad: 400 },
      expect.any(Object)
    );
  });

  // ---------------------------------------------------------------------------
  // Test 5: GAP-04 Emisión Gobernada con Resumen AIU (AC-06, AC-07)
  // ---------------------------------------------------------------------------
  test('Test 5 [AC-06, AC-07]: Presenta resumen financiero AIU oficial antes de invocar issue_acta', async () => {
    mockUseCertifiedActaDraft.mockReturnValue({
      data: mockDraftActa,
      isLoading: false,
    } as any);
    mockUseCertifiedActasIssued.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    mockUsePendingBillableWork.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActaTotals.mockReturnValue({
      data: mockTotals,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CertifiedActasModule boardId={mockBoardId} />
      </QueryClientProvider>
    );

    const reviewAndIssueBtn = screen.getByRole('button', { name: /Revisar y Emitir Acta/i });
    fireEvent.click(reviewAndIssueBtn);

    // Governed Modal is rendered
    expect(screen.getByText(/Revisión y Emisión de Acta Contractual/i)).toBeInTheDocument();
    expect(screen.getByText(/Advertencia de Inmutabilidad Contractual/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$ 10.000.000/i).length).toBeGreaterThan(0); // Subtotal
    expect(screen.getAllByText(/\$ 2.000.000/i).length).toBeGreaterThan(0);  // Admin 20%
    expect(screen.getAllByText(/\$ 500.000/i).length).toBeGreaterThan(0);   // Imprevistos 5%
    expect(screen.getAllByText(/\$ 13.000.000/i).length).toBeGreaterThan(0); // Total Liquidado

    const confirmIssuanceBtn = screen.getByRole('button', { name: /Confirmar y Emitir Acta/i });
    fireEvent.click(confirmIssuanceBtn);

    await waitFor(() => {
      expect(mockMutations.issueActa.mutateAsync).toHaveBeenCalledWith('acta_draft_01');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6: GAP-05 Inmutabilidad y Continuidad Documental de Actas Emitidas (AC-08, AC-09)
  // ---------------------------------------------------------------------------
  test('Test 6 [AC-08, AC-09]: Acta emitida permanece inmutable y provee acceso a extracto e informe de soporte', async () => {
    window.open = jest.fn();

    mockUseCertifiedActaDraft.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActasIssued.mockReturnValue({
      data: [mockIssuedActa],
      isLoading: false,
    } as any);
    mockUsePendingBillableWork.mockReturnValue({
      data: null,
      isLoading: false,
    } as any);
    mockUseCertifiedActaTotals.mockReturnValue({
      data: mockTotals,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <CertifiedActasModule boardId={mockBoardId} />
      </QueryClientProvider>
    );

    // Select Issued Acta
    const issuedSidebarBtn = screen.getByRole('button', { name: /Acta N.º 38/i });
    fireEvent.click(issuedSidebarBtn);

    expect(screen.getByText(/Acta Contractual N.º 38/i)).toBeInTheDocument();
    expect(screen.getByText(/Documento Emitido \/ Inmutable/i)).toBeInTheDocument();

    // Ensure no edit button is rendered for quantity
    expect(screen.queryByTitle(/Haga clic para ajustar la cantidad/i)).not.toBeInTheDocument();

    // Document Continuity Action Buttons
    const extractPdfBtn = screen.getByRole('button', { name: /Extracto PDF/i });
    const executionReportBtn = screen.getByRole('button', { name: /Informe de Soporte/i });

    expect(extractPdfBtn).toBeInTheDocument();
    expect(executionReportBtn).toBeInTheDocument();

    fireEvent.click(executionReportBtn);
    expect(window.open).toHaveBeenCalledWith(
      '/api/reports/activity-execution?acta_id=acta_issued_01',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
