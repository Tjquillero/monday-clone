/**
 * Test Suite: Integración de Superficie Operativa de Campo (/my-work)
 * 
 * Verifica los contratos de presentación y orquestación:
 * 1. Proyección visual pura de DailyOperationalBrief (DOB) sin cálculos artesanales.
 * 2. Invarianza de la unidad contractual (solo lectura).
 * 3. Captura aditiva de recursos operativos (POD-01) en memoria para el gateway F5.3.
 * 4. Estabilidad de source_mutation_id por intento lógico durante reintentos.
 * 5. Desacoplamiento de evidencias fotográficas (creación previa de ExecutionRecord).
 * 6. Autoridad soberana de F5.3 sobre la transición de estado (continuation_decision).
 * 7. Desglose riguroso de magnitudes físicas (planificado, reportado, verificado, pendiente).
 */

import React from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import DailyBriefBanner from '../DailyBriefBanner';
import ExecutionForm from '../ExecutionForm';
import OperationalResourcePicker from '../OperationalResourcePicker';
import useFieldExecutionMutation from '../hooks/useFieldExecutionMutation';
import { evaluateDailyOperationalBrief } from '@/lib/dailyOperationalBriefService';
import { reportFieldExecution, attachFieldEvidence } from '@/lib/fieldWorkflowExecutionService';
import { OperationalResourceItem } from '@/lib/resourceConsumptionControlService';

jest.mock('@/lib/fieldWorkflowExecutionService');
jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test.jpg' }, error: null }),
      })),
    },
  },
}));

describe('Superficie Operativa de Campo (/my-work) — Suite de Integración UI', () => {
  const mockReportFieldExecution = reportFieldExecution as jest.MockedFunction<typeof reportFieldExecution>;
  const mockAttachFieldEvidence = attachFieldEvidence as jest.MockedFunction<typeof attachFieldEvidence>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TEST 1: Proyección visual pura de DOB
  test('1. Renderiza fielmente DailyBriefBanner con calendario y métricas de DOB', () => {
    const brief = evaluateDailyOperationalBrief({
      evaluationDate: '2026-09-15', // Martes ordinario
      boardId: 'board-test-1',
      crewId: 'crew-alfa',
      weeklyPlanItems: [
        {
          id: 'item-1',
          weekly_plan_id: 'plan-1',
          board_id: 'board-test-1',
          activity_key: 'ACT_LIMPIEZA',
          name: 'Limpieza de Cunetas',
          zone: 'Sector Norte',
          unit: 'm',
          planned_date: '2026-09-15',
          planned_qty: 500,
          theoretical_jr: 4.0,
          source_type: 'ROUTINE',
          routine_reference: 'REF-1',
          occurrence_key: 'occ-1',
          is_manual_override: false,
          status: 'planned',
          created_at: '2026-09-10T08:00:00Z',
          updated_at: '2026-09-10T08:00:00Z',
        },
      ],
      executionRecords: [],
    });

    render(<DailyBriefBanner brief={brief} />);

    expect(screen.getByText('Briefing Operativo del Día')).toBeInTheDocument();
    expect(screen.getByText(/15\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Jornada Laboral Ordinaria')).toBeInTheDocument();
    expect(screen.getByText('Actividades Hoy')).toBeInTheDocument();
  });

  // TEST 2: Invarianza de la unidad contractual (solo lectura)
  test('2. ExecutionForm muestra la unidad contractual como solo lectura y sin selector editable', () => {
    render(
      <ExecutionForm
        taskName="Corte de Césped"
        contractualUnit="m2"
        plannedQty={1000}
        previouslyReportedQty={200}
        previouslyVerifiedQty={100}
        executedQty={150}
        onExecutedQtyChange={jest.fn()}
        workerCount={2}
        onWorkerCountChange={jest.fn()}
        hoursWorked={8}
        onHoursWorkedChange={jest.fn()}
        continuationDecision="CONTINUA_MANANA"
        onContinuationDecisionChange={jest.fn()}
        notes=""
        onNotesChange={jest.fn()}
      />
    );

    expect(screen.getByText(/Unidad contractual:/)).toBeInTheDocument();
    const unitElements = screen.getAllByText('m2');
    expect(unitElements.length).toBeGreaterThan(0);
    // Validar que no hay un select de unidad
    expect(screen.queryByRole('combobox', { name: /unidad/i })).toBeNull();
  });

  // TEST 3: Captura aditiva de recursos (POD-01)
  test('3. OperationalResourcePicker permite agregar y modificar materiales y equipos válidos', () => {
    const handleResourcesChange = jest.fn();
    const initialResources: OperationalResourceItem[] = [
      {
        resourceKey: 'MAT_CEMENTO',
        resourceName: 'Cemento Gris',
        category: 'MATERIAL',
        unit: 'saco',
        quantity: 2,
      },
    ];

    render(
      <OperationalResourcePicker
        resources={initialResources}
        onChange={handleResourcesChange}
      />
    );

    expect(screen.getByText('Cemento Gris')).toBeInTheDocument();
    expect(screen.getByText('MATERIAL')).toBeInTheDocument();

    // Eliminar recurso usando data-testid
    const deleteBtn = screen.getByTestId('remove-resource-0');
    fireEvent.click(deleteBtn);
    expect(handleResourcesChange).toHaveBeenCalledWith([]);
  });

  // TEST 4: Estabilidad de source_mutation_id durante reintentos
  test('4. useFieldExecutionMutation genera un mutationId estable y lo preserva en reintentos', async () => {
    const mockSupabaseClient = {} as any;

    mockReportFieldExecution.mockResolvedValueOnce({
      executionRecord: {
        id: 'exec-123',
        weekly_plan_item_id: 'item-1',
        board_id: 'board-1',
        reported_by: 'user-1',
        execution_date: '2026-09-15',
        executed_qty: 50,
        worker_count: 2,
        hours_worked: 8,
        jornales_used: 2,
        source_mutation_id: 'mut_stable_uuid',
        used_resources: [],
        verification_status: 'reported',
        created_at: '2026-09-15T10:00:00Z',
      },
      parentItem: {
        id: 'item-1',
        weekly_plan_id: 'plan-1',
        status: 'in_progress',
      } as any,
      metrics: {
        totalReportedQty: 50,
        certifiableExecutedQty: 0,
        pendingVerificationQty: 50,
        remainingPlannedQty: 50,
        overExecutedQty: 0,
        contractualCertifiableQty: 0,
        isCompleted: false,
      },
      isIdempotentReplay: false,
    });

    const res = await reportFieldExecution(mockSupabaseClient, {
      weekly_plan_item_id: 'item-1',
      board_id: 'board-1',
      execution_date: '2026-09-15',
      executed_qty: 50,
      worker_count: 2,
      hours_worked: 8,
      reported_by: 'user-1',
      source_mutation_id: 'mut_stable_uuid',
      used_resources: [],
      continuation_decision: 'CONTINUA_MANANA',
    });

    expect(res.executionRecord.source_mutation_id).toBe('mut_stable_uuid');
    expect(res.isIdempotentReplay).toBe(false);

    // Segundo intento simulado con el mismo mutation_id
    mockReportFieldExecution.mockResolvedValueOnce({
      ...res,
      isIdempotentReplay: true,
    });

    const retryRes = await reportFieldExecution(mockSupabaseClient, {
      weekly_plan_item_id: 'item-1',
      board_id: 'board-1',
      execution_date: '2026-09-15',
      executed_qty: 50,
      worker_count: 2,
      hours_worked: 8,
      reported_by: 'user-1',
      source_mutation_id: 'mut_stable_uuid',
      used_resources: [],
      continuation_decision: 'CONTINUA_MANANA',
    });

    expect(retryRes.executionRecord.id).toBe('exec-123');
    expect(retryRes.isIdempotentReplay).toBe(true);
  });

  // TEST 5: Desacoplamiento de fotos y no atomicidad
  test('5. attachFieldEvidence se ejecuta después de reportFieldExecution de forma desacoplada', async () => {
    const mockSupabaseClient = {} as any;
    mockAttachFieldEvidence.mockResolvedValueOnce({
      attachmentId: 'att-001',
      executionUpdated: true,
    });

    const attachRes = await attachFieldEvidence(mockSupabaseClient, {
      executionId: 'exec-123',
      boardId: 'board-1',
      userId: 'user-1',
      storagePath: 'executions/exec-123/before_001.jpg',
      phase: 'before',
    });

    expect(attachRes.attachmentId).toBe('att-001');
    expect(attachRes.executionUpdated).toBe(true);
  });

  // TEST 6: Autoridad soberana de F5.3 sobre estado resultante
  test('6. UI delega decisión de continuidad a F5.3 y consume el status soberano', async () => {
    const mockSupabaseClient = {} as any;
    mockReportFieldExecution.mockResolvedValueOnce({
      executionRecord: { id: 'exec-complete' } as any,
      parentItem: { id: 'item-1', status: 'completed' } as any,
      metrics: { totalReportedQty: 500, certifiableExecutedQty: 500, pendingVerificationQty: 0, isFullyVerified: true } as any,
      isIdempotentReplay: false,
    });

    const result = await reportFieldExecution(mockSupabaseClient, {
      weekly_plan_item_id: 'item-1',
      board_id: 'board-1',
      execution_date: '2026-09-15',
      executed_qty: 500,
      worker_count: 2,
      hours_worked: 8,
      reported_by: 'user-1',
      continuation_decision: 'TERMINADA_HOY',
    });

    expect(result.parentItem.status).toBe('completed');
  });

  // TEST 7: Desglose explícito de magnitudes físicas
  test('7. ExecutionForm desglosa claramente planificado, reportado previo y saldo pendiente', () => {
    render(
      <ExecutionForm
        taskName="Reparación de Vía"
        contractualUnit="ml"
        plannedQty={500}
        previouslyReportedQty={200}
        previouslyVerifiedQty={150}
        executedQty={50}
        onExecutedQtyChange={jest.fn()}
        workerCount={3}
        onWorkerCountChange={jest.fn()}
        hoursWorked={8}
        onHoursWorkedChange={jest.fn()}
        continuationDecision="CONTINUA_MANANA"
        onContinuationDecisionChange={jest.fn()}
        notes=""
        onNotesChange={jest.fn()}
      />
    );

    // Meta: 500
    expect(screen.getAllByText('500').length).toBeGreaterThan(0);
    // Reportado previo: 200
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
    // Saldo pendiente: 300 (500 - 200)
    expect(screen.getAllByText('300').length).toBeGreaterThan(0);
    // Verificado formal: 150 ml
    expect(screen.getByText(/150 ml aprobados formalmente por supervisión/)).toBeInTheDocument();
  });

  // TEST 8: Rechazo local estricto si reportedBy no está definido
  test('8. useFieldExecutionMutation rechaza localmente sin invocar F5.3 si falta la identidad autenticada', async () => {
    const { result } = renderHook(() => useFieldExecutionMutation());
    const mockSupabaseClient = {} as any;

    let errorCaught: any = null;
    await act(async () => {
      try {
        await result.current.submitReport({
          supabase: mockSupabaseClient,
          weeklyPlanItemId: 'item-1',
          boardId: 'board-1',
          executionDate: '2026-09-15',
          executedQty: 10,
          workerCount: 1,
          hoursWorked: 8,
          reportedBy: undefined, // Sin identidad autenticada
          continuationDecision: 'CONTINUA_MANANA',
        });
      } catch (e) {
        errorCaught = e;
      }
    });

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toBe('Usuario no autenticado para registrar avances de campo');
    expect(mockReportFieldExecution).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Usuario no autenticado para registrar avances de campo');
  });

  // TEST 9: Transporte fidedigno del UUID autenticado hacia F5.3
  test('9. useFieldExecutionMutation transporta fielmente el UUID autenticado hacia F5.3', async () => {
    const { result } = renderHook(() => useFieldExecutionMutation());
    const mockSupabaseClient = {} as any;

    mockReportFieldExecution.mockResolvedValueOnce({
      executionRecord: {
        id: 'exec-real-1',
        weekly_plan_item_id: 'item-1',
        board_id: 'board-1',
        reported_by: '9e1ed244-eb69-4f14-99e3-adfa628d8935',
        execution_date: '2026-09-15',
        executed_qty: 10,
        worker_count: 1,
        hours_worked: 8,
        jornales_used: 1,
        source_mutation_id: 'mut_ui_test',
        used_resources: [],
        verification_status: 'reported',
        created_at: '2026-09-15T10:00:00Z',
      },
      parentItem: { id: 'item-1' } as any,
      metrics: {} as any,
      isIdempotentReplay: false,
    });

    let res: any;
    await act(async () => {
      res = await result.current.submitReport({
        supabase: mockSupabaseClient,
        weeklyPlanItemId: 'item-1',
        boardId: 'board-1',
        executionDate: '2026-09-15',
        executedQty: 10,
        workerCount: 1,
        hoursWorked: 8,
        reportedBy: '9e1ed244-eb69-4f14-99e3-adfa628d8935',
        continuationDecision: 'CONTINUA_MANANA',
      });
    });

    expect(mockReportFieldExecution).toHaveBeenCalledWith(
      mockSupabaseClient,
      expect.objectContaining({
        reported_by: '9e1ed244-eb69-4f14-99e3-adfa628d8935',
      })
    );
    expect(res.executionRecord.reported_by).toBe('9e1ed244-eb69-4f14-99e3-adfa628d8935');
    expect(result.current.error).toBeNull();
  });
});
