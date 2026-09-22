/**
 * Test Suite: Transactional Outbox & Recovery Service (WF-C08-01 a WF-C08-12)
 * Baseline Entrada: 120 suites / 980 tests
 */

jest.mock('../workflowAutomationEngine', () => ({
  processDomainEventAutomations: jest.fn(),
  computeGatewayIdempotencyKey: jest.fn(),
}));

import {
  emitDomainEventToOutbox,
  claimOutboxBatch,
  completeOutboxEvent,
  processOutboxBatch,
  getBoardOutboxAuditLog,
} from '../transactionalOutboxService';
import {
  ClaimedOutboxEvent,
  CreateOutboxEventInput,
} from '../../types/transactionalOutbox';
import {
  AutomationDefinition,
  TrustedAutomationContext,
} from '../../types/workflowAutomation';
import { processDomainEventAutomations } from '../workflowAutomationEngine';

describe('TransactionalOutboxService (WF-C08-01 a WF-C08-12)', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      rpc: jest.fn(),
    };
  });

  const trustedContext: TrustedAutomationContext = {
    actorType: 'AUTOMATION',
    automationDefinitionId: 'def-1',
    boardId: 'board-100',
    roles: ['admin'],
  };

  test('WF-C08-01: emitDomainEventToOutbox persiste un evento con status PENDING', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'outbox-uuid-1' },
      error: null,
    });

    const input: CreateOutboxEventInput = {
      eventId: 'evt__EXEC_REP__exec-1__mut-1',
      eventType: 'EXECUTION_REPORTED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-1',
      sourceMutationId: 'mut-1',
      payload: { executed_qty: 20 },
    };

    const res = await emitDomainEventToOutbox(mockSupabase, input);

    expect(res.success).toBe(true);
    expect(res.outboxId).toBe('outbox-uuid-1');
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'evt__EXEC_REP__exec-1__mut-1',
        status: 'PENDING',
      })
    );
  });

  test('WF-C08-02: claimOutboxBatch invoca RPC claim_outbox_batch y asigna token individual', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'outbox-uuid-1',
          event_id: 'evt__EXEC_REP__exec-1__mut-1',
          event_type: 'EXECUTION_REPORTED',
          board_id: 'board-100',
          entity_type: 'weekly_plan_item_executions',
          entity_id: 'exec-1',
          source_mutation_id: 'mut-1',
          actor: { actorType: 'USER' },
          causality_depth: 0,
          payload: { executed_qty: 20 },
          claim_token: 'token-individual-aaa',
          attempt_count: 1,
        },
      ],
      error: null,
    });

    const claimed = await claimOutboxBatch(mockSupabase, {
      workerId: 'worker-node-1',
      batchSize: 5,
      leaseSeconds: 60,
    });

    expect(claimed.length).toBe(1);
    expect(claimed[0].claimToken).toBe('token-individual-aaa');
    expect(claimed[0].attemptCount).toBe(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_outbox_batch', {
      p_worker_id: 'worker-node-1',
      p_batch_size: 5,
      p_lease_seconds: 60,
    });
  });

  test('WF-C08-03: completeOutboxEvent ejecuta CAS estricto devolviendo true si la transición fue exitosa', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: true,
      error: null,
    });

    const success = await completeOutboxEvent(mockSupabase, {
      eventId: 'outbox-uuid-1',
      claimToken: 'token-individual-aaa',
      targetStatus: 'PROCESSED',
    });

    expect(success).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('complete_outbox_event', {
      p_event_id: 'outbox-uuid-1',
      p_claim_token: 'token-individual-aaa',
      p_target_status: 'PROCESSED',
      p_error_message: null,
    });
  });

  test('WF-C08-04: completeOutboxEvent devuelve false si el worker es zombie o el lease expiró', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: false, // 0 rows affected en Postgres
      error: null,
    });

    const success = await completeOutboxEvent(mockSupabase, {
      eventId: 'outbox-uuid-1',
      claimToken: 'token-expired-zombie',
      targetStatus: 'PROCESSED',
    });

    expect(success).toBe(false);
  });

  test('WF-C08-05: processOutboxBatch entrega eventos al WorkflowAutomationEngine y marca PROCESSED', async () => {
    (processDomainEventAutomations as jest.Mock).mockResolvedValueOnce([
      {
        definitionId: 'def-1',
        matched: true,
        skipped: false,
        gatewayResult: { status: 'IDEMPOTENT_NO_OP' },
      },
    ]);

    mockSupabase.rpc.mockResolvedValueOnce({
      data: true, // completeOutboxEvent = true
      error: null,
    });

    const claimedEvents: ClaimedOutboxEvent[] = [
      {
        id: 'outbox-uuid-1',
        eventId: 'evt__EXEC_REP__exec-1__mut-1',
        eventType: 'EXECUTION_REPORTED',
        boardId: 'board-100',
        entityType: 'weekly_plan_item_executions',
        entityId: 'exec-1',
        sourceMutationId: 'mut-1',
        actor: { actorType: 'USER' },
        causalityDepth: 0,
        payload: { executed_qty: 20 },
        claimToken: 'token-valid-1',
        attemptCount: 1,
      },
    ];

    const definitions: AutomationDefinition[] = [];
    const summary = await processOutboxBatch(mockSupabase, claimedEvents, definitions, trustedContext);

    expect(summary.processedCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(processDomainEventAutomations).toHaveBeenCalled();
  });

  test('WF-C08-06: processOutboxBatch marca PENDING si falla el procesamiento con attemptCount < 5', async () => {
    (processDomainEventAutomations as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    mockSupabase.rpc.mockResolvedValueOnce({
      data: true,
      error: null,
    });

    const claimedEvents: ClaimedOutboxEvent[] = [
      {
        id: 'outbox-uuid-1',
        eventId: 'evt__EXEC_REP__exec-1__mut-1',
        eventType: 'EXECUTION_REPORTED',
        boardId: 'board-100',
        entityType: 'weekly_plan_item_executions',
        entityId: 'exec-1',
        sourceMutationId: 'mut-1',
        actor: { actorType: 'USER' },
        causalityDepth: 0,
        payload: { executed_qty: 20 },
        claimToken: 'token-valid-1',
        attemptCount: 2,
      },
    ];

    const summary = await processOutboxBatch(mockSupabase, claimedEvents, [], trustedContext);

    expect(summary.failedCount).toBe(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('complete_outbox_event', {
      p_event_id: 'outbox-uuid-1',
      p_claim_token: 'token-valid-1',
      p_target_status: 'PENDING',
      p_error_message: 'Network error',
    });
  });

  test('WF-C08-07: processOutboxBatch transiciona a DEAD_LETTER si attemptCount >= 5', async () => {
    (processDomainEventAutomations as jest.Mock).mockRejectedValueOnce(new Error('Fatal exception'));

    mockSupabase.rpc.mockResolvedValueOnce({
      data: true,
      error: null,
    });

    const claimedEvents: ClaimedOutboxEvent[] = [
      {
        id: 'outbox-uuid-1',
        eventId: 'evt__EXEC_REP__exec-1__mut-1',
        eventType: 'EXECUTION_REPORTED',
        boardId: 'board-100',
        entityType: 'weekly_plan_item_executions',
        entityId: 'exec-1',
        sourceMutationId: 'mut-1',
        actor: { actorType: 'USER' },
        causalityDepth: 0,
        payload: { executed_qty: 20 },
        claimToken: 'token-valid-1',
        attemptCount: 5,
      },
    ];

    const summary = await processOutboxBatch(mockSupabase, claimedEvents, [], trustedContext);

    expect(summary.failedCount).toBe(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('complete_outbox_event', {
      p_event_id: 'outbox-uuid-1',
      p_claim_token: 'token-valid-1',
      p_target_status: 'DEAD_LETTER',
      p_error_message: 'Fatal exception',
    });
  });

  test('WF-C08-08: getBoardOutboxAuditLog consulta la proyección tipada de auditoría sin exponer tokens', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: [
        {
          event_id: 'evt__EXEC_REP__exec-1__mut-1',
          event_type: 'EXECUTION_REPORTED',
          board_id: 'board-100',
          entity_type: 'weekly_plan_item_executions',
          entity_id: 'exec-1',
          status: 'PROCESSED',
          attempt_count: 1,
          last_error_message: null,
          created_at: '2026-09-13T10:00:00Z',
          updated_at: '2026-09-13T10:00:05Z',
        },
      ],
      error: null,
    });

    const logs = await getBoardOutboxAuditLog(mockSupabase, 'board-100');

    expect(logs.length).toBe(1);
    expect(logs[0].eventId).toBe('evt__EXEC_REP__exec-1__mut-1');
    expect(logs[0].status).toBe('PROCESSED');
    expect((logs[0] as any).claimToken).toBeUndefined(); // Protegido contra exposición
  });

  test('WF-C08-09: Replay post-crash con nuevo worker produce resultado idéntico e idempotent', async () => {
    // Worker B toma el evento tras expiración del lease de Worker A
    (processDomainEventAutomations as jest.Mock).mockResolvedValueOnce([
      {
        definitionId: 'def-1',
        matched: true,
        skipped: false,
        gatewayResult: { status: 'IDEMPOTENT_NO_OP' },
      },
    ]);

    mockSupabase.rpc.mockResolvedValueOnce({
      data: true,
      error: null,
    });

    const claimedEvents: ClaimedOutboxEvent[] = [
      {
        id: 'outbox-uuid-1',
        eventId: 'evt__EXEC_REP__exec-1__mut-1',
        eventType: 'EXECUTION_REPORTED',
        boardId: 'board-100',
        entityType: 'weekly_plan_item_executions',
        entityId: 'exec-1',
        sourceMutationId: 'mut-1',
        actor: { actorType: 'USER' },
        causalityDepth: 0,
        payload: { executed_qty: 20 },
        claimToken: 'token-worker-b-new',
        attemptCount: 2,
      },
    ];

    const summary = await processOutboxBatch(mockSupabase, claimedEvents, [], trustedContext);

    expect(summary.processedCount).toBe(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('complete_outbox_event', {
      p_event_id: 'outbox-uuid-1',
      p_claim_token: 'token-worker-b-new',
      p_target_status: 'PROCESSED',
      p_error_message: null,
    });
  });

  test('WF-C08-10: Manejo seguro ante error de base de datos en claimOutboxBatch lanza excepción controlada', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection failed' },
    });

    await expect(
      claimOutboxBatch(mockSupabase, { workerId: 'worker-1' })
    ).rejects.toThrow('[Outbox Claim Error] Database connection failed');
  });

  test('WF-C08-11: Manejo seguro ante error de base de datos en completeOutboxEvent lanza excepción controlada', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC execution failed' },
    });

    await expect(
      completeOutboxEvent(mockSupabase, {
        eventId: 'outbox-1',
        claimToken: 'token-1',
        targetStatus: 'PROCESSED',
      })
    ).rejects.toThrow('[Outbox Complete Error] RPC execution failed');
  });

  test('WF-C08-12: getBoardOutboxAuditLog maneja array vacío de forma limpia', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const logs = await getBoardOutboxAuditLog(mockSupabase, 'board-100');
    expect(logs).toEqual([]);
  });
});
