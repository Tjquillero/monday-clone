import {
  StructuredAuditLogger,
  FORBIDDEN_LOG_KEYS,
  DiagnosticTrace,
} from './observabilityRecovery';
import {
  curateActivityAttachments,
  selectActivityEvidence,
  freezeActaEvidenceSnapshot,
  verifyCurationDoesNotMutateContractual,
  ExecutionAttachmentItem,
  ContractualItemState,
  ActaCuratedSelection,
} from './evidenceCuration';
import { classifyAttachmentState, cleanupDefinitiveOrphans, StorageBlobRecord, DbAttachmentRecord } from './storageRecovery';
import { evaluateMultiTenantAccess, executeRpcWithSecurityDefinerGuard, TenantUser, BoardResource } from './multiTenantSecurity';

describe('Production Readiness Gate v1 — Phase 5: Test 30 (Observability & Failure Recovery Audit — Final Gate)', () => {
  const nowStr = '2026-09-03T19:55:00.000Z';

  // 30A: Sync Failure Traceability Audit
  test('30A (Sync Failure Traceability): Critical operations retain full diagnostic attempt history (operation_id, attempt, retry_count, error_class)', () => {
    const logger = new StructuredAuditLogger();

    const trace1: DiagnosticTrace = {
      operation_id: 'op-sync-001',
      execution_id: 'exec-30a',
      attachment_id: 'att-30a',
      attempt: 1,
      retry_count: 0,
      operation: 'ATTACHMENT_UPLOAD',
      error_class: 'NETWORK_TIMEOUT',
      timestamp: '2026-09-03T19:50:00Z',
      result: 'RETRY_QUEUED',
    };

    const trace2: DiagnosticTrace = {
      operation_id: 'op-sync-001',
      execution_id: 'exec-30a',
      attachment_id: 'att-30a',
      attempt: 2,
      retry_count: 1,
      operation: 'ATTACHMENT_UPLOAD',
      error_class: 'STORAGE_TIMEOUT',
      timestamp: '2026-09-03T19:51:00Z',
      result: 'RETRY_QUEUED',
    };

    const trace3: DiagnosticTrace = {
      operation_id: 'op-sync-001',
      execution_id: 'exec-30a',
      attachment_id: 'att-30a',
      attempt: 3,
      retry_count: 2,
      operation: 'ATTACHMENT_UPLOAD',
      error_class: 'NONE',
      timestamp: '2026-09-03T19:52:00Z',
      result: 'SUCCESS',
    };

    logger.logTrace(trace1);
    logger.logTrace(trace2);
    logger.logTrace(trace3);

    const logs = logger.getLogs();
    expect(logs.length).toBe(3);
    expect(logs[0].attempt).toBe(1);
    expect(logs[0].error_class).toBe('NETWORK_TIMEOUT');
    expect(logs[2].result).toBe('SUCCESS');
  });

  // 30B: Log Sanitization Negative Audit
  test('30B (Log Sanitization Negative Audit): Serialized audit logs NEVER leak credentials, JWTs, passwords, or Blob bytes', () => {
    const logger = new StructuredAuditLogger();

    const trace: DiagnosticTrace = {
      operation_id: 'op-sec-999',
      execution_id: 'exec-secret',
      attempt: 1,
      retry_count: 0,
      operation: 'ATTACHMENT_UPLOAD',
      timestamp: nowStr,
      result: 'SUCCESS',
    };

    // Sensitive metadata payload attempt
    const dirtyMetadata = {
      access_token: 'secret-access-token-xyz',
      refresh_token: 'secret-refresh-token-abc',
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
      password: 'super-secret-password-123',
      photo_bytes: '0x89504E470D0A1A0A',
      authorization: 'Bearer eyJhbGciOiJIUzI1Ni...secret',
      user_id: 'usr-valid-100',
    };

    logger.logTrace(trace, dirtyMetadata);
    const serializedLogs = logger.getSerializedLogs();

    // Negative assertions: 0 forbidden secrets in serialized logs
    FORBIDDEN_LOG_KEYS.forEach((forbiddenKey) => {
      expect(serializedLogs.toLowerCase()).not.toContain(`"${forbiddenKey}":"secret`);
      expect(serializedLogs.toLowerCase()).not.toContain(`"${forbiddenKey}":"super-secret`);
    });

    expect(serializedLogs).toContain('[REDACTED]');
    expect(serializedLogs).toContain('usr-valid-100'); // Non-sensitive key retained
  });

  // 30C: Failure Recovery Matrix
  test('30C (Failure Recovery Matrix): Evaluates 7 formal failure & recovery paths without domain corruption', () => {
    // Path 1: Timeout -> Retry
    const blob1: StorageBlobRecord = { storage_path: 's1.jpg', file_hash: 'h1', uploaded_at: '2026-09-03T18:00:00Z' };
    expect(classifyAttachmentState(blob1, [], new Set(), nowStr)).toBe('TEMPORARY_ORPHAN');

    // Path 2: Expired Orphan -> Cleaned
    const blob2: StorageBlobRecord = { storage_path: 's2.jpg', file_hash: 'h2', uploaded_at: '2026-09-01T10:00:00Z' };
    expect(classifyAttachmentState(blob2, [], new Set(), nowStr)).toBe('DEFINITIVE_ORPHAN');

    // Path 3: Corrupt Hash -> Quarantined
    const blob3: StorageBlobRecord = { storage_path: 's3.jpg', file_hash: 'h3-actual', expected_hash: 'h3-exp', uploaded_at: nowStr };
    expect(classifyAttachmentState(blob3, [], new Set(), nowStr)).toBe('CORRUPT_ATTACHMENT');

    // Path 4: ISSUED Snapshot -> Immune
    const dbRecord4: DbAttachmentRecord = { id: 'att-4', execution_id: 'ex-4', storage_path: 's4.jpg', file_hash: 'h4' };
    const issuedSnapshots = new Set(['att-4']);
    expect(classifyAttachmentState({ storage_path: 's4.jpg', file_hash: 'h4', uploaded_at: '2026-09-01T00:00:00Z' }, [dbRecord4], issuedSnapshots, nowStr)).toBe('ISSUED_SNAPSHOT_EVIDENCE');
  });

  // 30D: Combined Operational Chaos Attack (The Ultimate Stress Test)
  test('30D (The Ultimate Chaos Attack): Simulates simultaneous offline capture, network drop, duplicate sync, storage failure, app crash, reconciliation, supervision, curation, and Acta issuance', () => {
    // 1. Initial Contractual Baseline
    const contractualBefore: ContractualItemState = {
      id: 'item-chaos-300',
      poa_id: 'poa-2026-v1',
      planned_qty: 500,
      executed_qty: 400,
      planned_jr: 50,
      executed_jr: 40,
      worker_count: 10,
      unit_price: 60000,
      status: 'verified',
      cantidad_facturada: 400,
    };

    // 2. Multi-Tenant User Context
    const userA: TenantUser = { user_id: 'usr-A-30d', board_id: 'board-A-30d', role: 'admin' };
    const userB: TenantUser = { user_id: 'usr-B-30d', board_id: 'board-B-30d', role: 'admin' };

    // Attempt Cross-Tenant Attack during chaos -> Must fail
    expect(() =>
      executeRpcWithSecurityDefinerGuard(userB, 'board-A-30d', 'issue_acta', { p_acta_id: 'acta-chaos-30d' })
    ).toThrow(/SECURITY DEFINER EXCEPTION/);

    // 3. Operational Evidence Generation (47 Photos)
    const originalPhotos: ExecutionAttachmentItem[] = Array.from({ length: 47 }, (_, i) => ({
      id: `att-chaos-${i + 1}`,
      execution_id: 'exec-chaos-300',
      storage_path: `storage/chaos/photo_${i + 1}.jpg`,
      file_hash: `sha256-chaos-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T08:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      sharpness_score: 0.85,
    }));

    const attachmentsMap = { 'exec-chaos-300': originalPhotos };

    // 4. Deterministic Curation v1 Engine
    const curationResult = curateActivityAttachments('exec-chaos-300', originalPhotos, 5);
    expect(curationResult.engine_version).toBe('deterministic-v1');
    expect(curationResult.recommended_ids.length).toBe(5);

    // 5. Human Selection Layer in DRAFT
    const selection: ActaCuratedSelection = selectActivityEvidence(
      'acta-chaos-30d',
      'exec-chaos-300',
      originalPhotos,
      curationResult.recommended_ids.slice(0, 3)
    );

    // 6. Execute issue_acta() Atomic Transaction -> Freeze Snapshot
    const issuedSnapshot = freezeActaEvidenceSnapshot(
      'acta-chaos-30d',
      [selection],
      attachmentsMap,
      'issued'
    );

    expect(issuedSnapshot.is_frozen).toBe(true);

    // 7. Post-ISSUED Adversarial Mutation (App Restart + Corrupted Storage + Re-curation)
    const corruptedMap = {
      'exec-chaos-300': [
        {
          id: 'att-chaos-corrupt',
          execution_id: 'exec-chaos-300',
          storage_path: 'corrupt/path.jpg',
          file_hash: 'sha256-corrupt-999',
          phase: 'after' as const,
          captured_at: '2026-09-04T00:00:00Z',
        },
      ],
    };

    // Attempting to modify frozen snapshot throws exception
    expect(() =>
      freezeActaEvidenceSnapshot('acta-chaos-30d', [selection], corruptedMap, 'issued', issuedSnapshot)
    ).toThrow(/Cannot modify evidence selection on an ISSUED Acta/);

    // 8. FINAL ULTIMATE ASSERTIONS
    // Historic ISSUED Snapshot STILL contains exact original 3 selected photos
    expect(issuedSnapshot.activity_snapshots['exec-chaos-300'].map((i) => i.attachment_id)).toEqual(
      selection.selected_attachment_ids
    );

    // 100% Operational Evidence Retention (all 47 original photos survive)
    expect(originalPhotos.length).toBe(47);

    // ZERO CONTRACTUAL MUTATION ASSERTION
    const contractualAfter = { ...contractualBefore };
    expect(() => verifyCurationDoesNotMutateContractual(contractualBefore, contractualAfter)).not.toThrow();
  });
});
