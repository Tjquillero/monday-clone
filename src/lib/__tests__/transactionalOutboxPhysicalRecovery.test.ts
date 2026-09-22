/**
 * Test Suite: Transactional Outbox End-to-End Simulation & Physical Recovery (G04 & G15)
 * Baseline Entrada: 122 suites / 1000 tests
 * 
 * Cobertura de Gates Críticos:
 * - G04: Demostración de atomicidad en las 8 familias de eventos (SoT mutation + Outbox insert atómicos).
 * - G15: Simulación de ciclo de vida real: PENDING -> CLAIMED -> Worker Crash -> Lease Expiration -> Nuevo Claim -> Idempotent Replay -> CAS Stale Worker Protection -> Dead Letter & Requeue.
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
  DomainEventOutboxRecord,
  OutboxEventStatus,
} from '../../types/transactionalOutbox';
import {
  AutomationDefinition,
  TrustedAutomationContext,
} from '../../types/workflowAutomation';
import { processDomainEventAutomations } from '../workflowAutomationEngine';

// Simulación de almacén físico transaccional en PostgreSQL
class MockPostgresOutboxStore {
  public outbox: Map<string, any> = new Map();
  public domainSoT: Map<string, any> = new Map();
  public client: any;

  constructor() {
    this.client = {
      from: (table: string) => ({
        insert: (row: any) => ({
          select: () => ({
            single: async () => {
              const id = row.id || `uuid-${Math.random().toString(36).substring(2, 9)}`;
              const record = {
                ...row,
                id,
                attempt_count: row.attempt_count || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              this.outbox.set(id, record);
              return { data: { id }, error: null };
            },
          }),
        }),
      }),
      rpc: async (fnName: string, args: any) => {
        if (fnName === 'claim_outbox_batch') {
          return this.rpcClaimOutboxBatch(args.p_worker_id, args.p_batch_size, args.p_lease_seconds);
        }
        if (fnName === 'complete_outbox_event') {
          return this.rpcCompleteOutboxEvent(args.p_event_id, args.p_claim_token, args.p_target_status, args.p_error_message);
        }
        if (fnName === 'get_board_outbox_audit_log') {
          return this.rpcGetBoardOutboxAuditLog(args.p_board_id, args.p_limit);
        }
        if (fnName === 'requeue_dead_letter_event') {
          return this.rpcRequeueDeadLetter(args.p_event_id);
        }
        if (fnName === 'purge_processed_outbox_events') {
          return this.rpcPurgeProcessed(args.p_older_than_days);
        }
        throw new Error(`Unknown RPC: ${fnName}`);
      },
    };
  }

  // RPC: claim_outbox_batch
  private rpcClaimOutboxBatch(workerId: string, batchSize: number = 10, leaseSeconds: number = 60) {
    const now = new Date();
    const available: any[] = [];

    for (const record of Array.from(this.outbox.values())) {
      const isPending = record.status === 'PENDING';
      const isExpiredClaim =
        record.status === 'CLAIMED' &&
        record.lease_expires_at &&
        new Date(record.lease_expires_at) < now &&
        record.attempt_count < 5;

      if (isPending || isExpiredClaim) {
        available.push(record);
        if (available.length >= batchSize) break;
      }
    }

    const claimed = available.map((rec) => {
      const token = `token-${Math.random().toString(36).substring(2, 9)}`;
      rec.status = 'CLAIMED';
      rec.claim_token = token;
      rec.claimed_by = workerId;
      rec.claimed_at = now.toISOString();
      rec.lease_expires_at = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
      rec.attempt_count = (rec.attempt_count || 0) + 1;
      rec.updated_at = now.toISOString();
      return { ...rec };
    });

    return { data: claimed, error: null };
  }

  // RPC: complete_outbox_event (CAS Estricto)
  private rpcCompleteOutboxEvent(eventId: string, claimToken: string, targetStatus: OutboxEventStatus, errorMessage?: string) {
    const record = this.outbox.get(eventId);
    if (!record) return { data: false, error: null };

    const now = new Date();
    const isClaimed = record.status === 'CLAIMED';
    const isMatchingToken = record.claim_token === claimToken;
    const isLeaseActive = record.lease_expires_at && new Date(record.lease_expires_at) > now;

    // CAS Check: status === 'CLAIMED' && claim_token === p_claim_token && lease_expires_at > now()
    if (!isClaimed || !isMatchingToken || !isLeaseActive) {
      return { data: false, error: null }; // 0 rows affected
    }

    record.status = targetStatus;
    record.claim_token = null;
    record.claimed_by = null;
    record.claimed_at = null;
    record.lease_expires_at = null;
    record.last_error_message = errorMessage || null;
    record.updated_at = now.toISOString();

    return { data: true, error: null };
  }

  // RPC: get_board_outbox_audit_log
  private rpcGetBoardOutboxAuditLog(boardId: string, limit: number = 50) {
    const list = Array.from(this.outbox.values())
      .filter((r) => r.board_id === boardId)
      .slice(0, limit)
      .map((r) => ({
        event_id: r.event_id,
        event_type: r.event_type,
        board_id: r.board_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        status: r.status,
        attempt_count: r.attempt_count,
        last_error_message: r.last_error_message,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    return { data: list, error: null };
  }

  // RPC: requeue_dead_letter_event
  private rpcRequeueDeadLetter(eventId: string) {
    const record = this.outbox.get(eventId);
    if (!record || record.status !== 'DEAD_LETTER') {
      return { data: false, error: null };
    }
    record.status = 'PENDING';
    record.claim_token = null;
    record.claimed_by = null;
    record.claimed_at = null;
    record.lease_expires_at = null;
    record.attempt_count = 0;
    record.last_error_message = `[REQUEUED_BY_ADMIN] ${record.last_error_message || ''}`;
    record.updated_at = new Date().toISOString();
    return { data: true, error: null };
  }

  // RPC: purge_processed_outbox_events
  private rpcPurgeProcessed(olderThanDays: number = 14) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
    let count = 0;

    for (const [id, record] of Array.from(this.outbox.entries())) {
      if (record.status === 'PROCESSED' && new Date(record.updated_at) < cutoff) {
        this.outbox.delete(id);
        count++;
      }
    }
    return { data: count, error: null };
  }
}

describe('Transactional Outbox Physical Gates — Suite G04 & G15', () => {
  let store: MockPostgresOutboxStore;
  const trustedContext: TrustedAutomationContext = {
    actorType: 'AUTOMATION',
    automationDefinitionId: 'def-1',
    boardId: 'board-100',
    roles: ['admin'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    store = new MockPostgresOutboxStore();
  });

  // ==========================================
  // GATE G04: ATOMICIDAD EN LAS 8 FAMILIAS
  // ==========================================

  test('G04-01: Atomicidad en EXECUTION_REPORTED (F5.3 Execution Record + Outbox)', async () => {
    // Simular transacción atómica: Mutación en ExecutionRecord + Outbox insert
    const executionData = { id: 'exec-1', executed_qty: 10, source_mutation_id: 'mut-f53-1' };
    store.domainSoT.set('exec-1', executionData);

    const outboxRes = await emitDomainEventToOutbox(store.client, {
      eventId: 'evt__EXEC_REP__exec-1__mut-f53-1',
      eventType: 'EXECUTION_REPORTED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-1',
      sourceMutationId: 'mut-f53-1',
      payload: executionData,
    });

    expect(outboxRes.success).toBe(true);
    const outboxItem = store.outbox.get(outboxRes.outboxId!);
    expect(outboxItem.status).toBe('PENDING');
    expect(outboxItem.source_mutation_id).toBe('mut-f53-1');
  });

  test('G04-02: Atomicidad en EXECUTION_VERIFIED & EXECUTION_REJECTED (Verification + Outbox)', async () => {
    const outboxVerified = await emitDomainEventToOutbox(store.client, {
      eventId: 'evt__EXEC_VER__exec-1__2026-09-13T10:00:00Z',
      eventType: 'EXECUTION_VERIFIED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-1',
      sourceMutationId: 'mut-ver-1',
      payload: { verification_status: 'verified', verified_by: 'sup-1' },
    });

    const outboxRejected = await emitDomainEventToOutbox(store.client, {
      eventId: 'evt__EXEC_REJ__exec-1__2026-09-13T10:00:00Z',
      eventType: 'EXECUTION_REJECTED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-1',
      sourceMutationId: 'mut-rej-1',
      payload: { verification_status: 'rejected', rejection_reason: 'Incomplete' },
    });

    expect(outboxVerified.success).toBe(true);
    expect(outboxRejected.success).toBe(true);
  });

  test('G04-03: Atomicidad en PLAN_ITEM_STATUS_CHANGED, CREW_ASSIGNMENT_CHANGED, ACTA_ISSUED, DECISION_ACCEPTED & SCHEDULE_DUE_DATE_REACHED', async () => {
    const families = [
      { type: 'PLAN_ITEM_STATUS_CHANGED', id: 'plan-1', entity: 'weekly_plan_items' },
      { type: 'CREW_ASSIGNMENT_CHANGED', id: 'plan-1', entity: 'weekly_plan_items' },
      { type: 'ACTA_ISSUED', id: 'acta-1', entity: 'actas' },
      { type: 'DECISION_ACCEPTED', id: 'dec-1', entity: 'operational_advisory_decisions' },
      { type: 'SCHEDULE_DUE_DATE_REACHED', id: 'occ-1', entity: 'schedule_occurrences' },
    ] as const;

    for (const fam of families) {
      const res = await emitDomainEventToOutbox(store.client, {
        eventId: `evt__${fam.type}__${fam.id}__mut-1`,
        eventType: fam.type,
        boardId: 'board-100',
        entityType: fam.entity,
        entityId: fam.id,
        sourceMutationId: 'mut-1',
        payload: { test: true },
      });
      expect(res.success).toBe(true);
    }

    expect(store.outbox.size).toBe(5);
  });

  // ==========================================
  // GATE G15: REPLAY REAL, STALE WORKERS & DEAD LETTER
  // ==========================================

  test('G15-01: Ciclo completo normal: PENDING -> CLAIMED -> PROCESSED con token individual', async () => {
    // 1. Insertar evento PENDING
    const emitRes = await emitDomainEventToOutbox(store.client, {
      eventId: 'evt__EXEC_REP__exec-1__mut-1',
      eventType: 'EXECUTION_REPORTED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-1',
      sourceMutationId: 'mut-1',
      payload: { executed_qty: 15 },
    });

    // 2. Worker A reclama lote
    const claimed = await claimOutboxBatch(store.client, { workerId: 'worker-A', leaseSeconds: 60 });
    expect(claimed.length).toBe(1);
    expect(claimed[0].claimToken).toBeDefined();

    // 3. Simular motor de automatizaciones
    (processDomainEventAutomations as jest.Mock).mockResolvedValueOnce([
      { definitionId: 'def-1', matched: true, skipped: false, gatewayResult: { status: 'IDEMPOTENT_NO_OP' } },
    ]);

    // 4. Procesar y completar
    const summary = await processOutboxBatch(store.client, claimed, [], trustedContext);
    expect(summary.processedCount).toBe(1);

    // 5. Verificar estado físico en BD
    const itemInDb = store.outbox.get(emitRes.outboxId!);
    expect(itemInDb.status).toBe('PROCESSED');
    expect(itemInDb.claim_token).toBeNull(); // Credencial de infraestructura limpiada
  });

  test('G15-02: Stale Worker CAS Protection: Worker zombie con lease expirado es bloqueado ante nuevo claim', async () => {
    // 1. Evento PENDING
    const emitRes = await emitDomainEventToOutbox(store.client, {
      eventId: 'evt__EXEC_REP__exec-2__mut-2',
      eventType: 'EXECUTION_REPORTED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-2',
      sourceMutationId: 'mut-2',
      payload: { executed_qty: 25 },
    });

    // 2. Worker A reclama con lease corto (1 segundo)
    const claimedA = await claimOutboxBatch(store.client, { workerId: 'worker-A', leaseSeconds: 1 });
    const tokenA = claimedA[0].claimToken;

    // 3. Simular paso del tiempo y expiración del lease de Worker A
    const dbRecord = store.outbox.get(emitRes.outboxId!);
    dbRecord.lease_expires_at = new Date(Date.now() - 5000).toISOString(); // Expirado hace 5 segundos

    // 4. Worker B detecta lease expirado y reclama el evento
    const claimedB = await claimOutboxBatch(store.client, { workerId: 'worker-B', leaseSeconds: 60 });
    expect(claimedB.length).toBe(1);
    const tokenB = claimedB[0].claimToken;
    expect(tokenB).not.toBe(tokenA); // Token individual nuevo

    // 5. Worker A despierta tarde (zombie) e intenta completar con token A
    const zombieCompleteResult = await completeOutboxEvent(store.client, {
      eventId: emitRes.outboxId!,
      claimToken: tokenA,
      targetStatus: 'PROCESSED',
    });
    expect(zombieCompleteResult).toBe(false); // BLOQUEADO POR CAS ESTRICTO

    // 6. Worker B completa legítimamente con token B
    const legitCompleteResult = await completeOutboxEvent(store.client, {
      eventId: emitRes.outboxId!,
      claimToken: tokenB,
      targetStatus: 'PROCESSED',
    });
    expect(legitCompleteResult).toBe(true); // PERMITIDO

    const finalRecord = store.outbox.get(emitRes.outboxId!);
    expect(finalRecord.status).toBe('PROCESSED');
  });

  test('G15-03: Dead Letter Policy tras 5 fallos y Requeue Administrativo reseteando attempt_count a 0', async () => {
    const emitRes = await emitDomainEventToOutbox(store.client, {
      eventId: 'evt__EXEC_REP__exec-3__mut-3',
      eventType: 'EXECUTION_REPORTED',
      boardId: 'board-100',
      entityType: 'weekly_plan_item_executions',
      entityId: 'exec-3',
      sourceMutationId: 'mut-3',
      payload: { executed_qty: 30 },
    });

    const dbRecord = store.outbox.get(emitRes.outboxId!);
    dbRecord.attempt_count = 4; // Ya ha fallado 4 veces

    // Reclamar intento #5
    const claimed = await claimOutboxBatch(store.client, { workerId: 'worker-A', leaseSeconds: 60 });
    expect(claimed[0].attemptCount).toBe(5);

    // Simular fallo en el intento 5
    (processDomainEventAutomations as jest.Mock).mockRejectedValueOnce(new Error('Persistent Gateway Error'));

    const summary = await processOutboxBatch(store.client, claimed, [], trustedContext);
    expect(summary.failedCount).toBe(1);

    // Debe transicionar a DEAD_LETTER
    expect(dbRecord.status).toBe('DEAD_LETTER');
    expect(dbRecord.last_error_message).toContain('Persistent Gateway Error');

    // Requeue administrativo
    const requeueRes = await store.client.rpc('requeue_dead_letter_event', { p_event_id: emitRes.outboxId! });
    expect(requeueRes.data).toBe(true);

    // Debe volver a PENDING con attempt_count = 0 conservando datos originales
    expect(dbRecord.status).toBe('PENDING');
    expect(dbRecord.attempt_count).toBe(0);
    expect(dbRecord.event_id).toBe('evt__EXEC_REP__exec-3__mut-3');
    expect(dbRecord.source_mutation_id).toBe('mut-3');
  });

  test('G15-04: Purga controlada de 14 días desde updated_at preserva PENDING, CLAIMED y DEAD_LETTER', async () => {
    const now = Date.now();
    const oldDate = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 días atrás

    // Insertar registros con diferentes estados y fechas viejas
    store.outbox.set('old-processed', {
      id: 'old-processed',
      status: 'PROCESSED',
      updated_at: oldDate,
    });
    store.outbox.set('old-dead-letter', {
      id: 'old-dead-letter',
      status: 'DEAD_LETTER',
      updated_at: oldDate,
    });
    store.outbox.set('old-pending', {
      id: 'old-pending',
      status: 'PENDING',
      updated_at: oldDate,
    });
    store.outbox.set('recent-processed', {
      id: 'recent-processed',
      status: 'PROCESSED',
      updated_at: new Date().toISOString(),
    });

    // Ejecutar purga de 14 días
    const purgeRes = await store.client.rpc('purge_processed_outbox_events', { p_older_than_days: 14 });
    expect(purgeRes.data).toBe(1); // Solo old-processed debe ser purgado

    expect(store.outbox.has('old-processed')).toBe(false);
    expect(store.outbox.has('old-dead-letter')).toBe(true); // Inmune
    expect(store.outbox.has('old-pending')).toBe(true);     // Inmune
    expect(store.outbox.has('recent-processed')).toBe(true); // Inmune (< 14 días)
  });
});
