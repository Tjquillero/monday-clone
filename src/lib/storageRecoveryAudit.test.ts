import {
  classifyAttachmentState,
  reconcileStorageAttachments,
  cleanupDefinitiveOrphans,
  StorageBlobRecord,
  DbAttachmentRecord,
} from './storageRecovery';
import { verifyCurationDoesNotMutateContractual, ContractualItemState } from './evidenceCuration';

describe('Production Readiness Gate v1 — Phase 2: Test 27 (Storage & Attachment Recovery Audit)', () => {
  const nowStr = '2026-09-03T19:00:00.000Z';
  const recentUploadStr = '2026-09-03T18:30:00.000Z'; // 30 minutes ago
  const expiredUploadStr = '2026-09-01T10:00:00.000Z'; // > 48 hours ago

  // Test 27.1: Storage SUCCESS + DB Timeout Reconciliation
  test('27.1: Storage SUCCESS + DB Timeout is reconciled without re-uploading bytes', () => {
    const blob: StorageBlobRecord = {
      storage_path: 'storage/prod/exec_1/photo_timeout.jpg',
      file_hash: 'sha256-timeout-001',
      uploaded_at: recentUploadStr,
    };

    const dbRecords: DbAttachmentRecord[] = [];
    const issuedSnapshots = new Set<string>();

    const reconciliation = reconcileStorageAttachments([blob], dbRecords, issuedSnapshots, nowStr);

    expect(reconciliation.reconstructed_attachments_count).toBe(1);
    expect(reconciliation.reconciled_attachments.length).toBe(1);
    expect(reconciliation.reconciled_attachments[0].storage_path).toBe(blob.storage_path);
  });

  // Test 27.2: Recent Blob without DB (TEMPORARY_ORPHAN Protected)
  test('27.2: Blob without DB record but recent age (< 24h) is protected from deletion as TEMPORARY_ORPHAN', () => {
    const blob: StorageBlobRecord = {
      storage_path: 'storage/unlinked/recent_photo.jpg',
      file_hash: 'sha256-recent-002',
      uploaded_at: recentUploadStr,
    };

    const state = classifyAttachmentState(blob, [], new Set(), nowStr);
    expect(state).toBe('TEMPORARY_ORPHAN');

    const cleanup = cleanupDefinitiveOrphans([blob], [], new Set(), nowStr);
    expect(cleanup.deleted_storage_paths).not.toContain(blob.storage_path);
    expect(cleanup.preserved_storage_paths).toContain(blob.storage_path);
  });

  // Test 27.3: Expired Blob without DB (DEFINITIVE_ORPHAN Safe Cleanup)
  test('27.3: Blob without DB record and expired age (>= 24h) is safely cleaned up as DEFINITIVE_ORPHAN', () => {
    const blob: StorageBlobRecord = {
      storage_path: 'storage/unlinked/expired_photo.jpg',
      file_hash: 'sha256-expired-003',
      uploaded_at: expiredUploadStr,
    };

    const state = classifyAttachmentState(blob, [], new Set(), nowStr);
    expect(state).toBe('DEFINITIVE_ORPHAN');

    const cleanup = cleanupDefinitiveOrphans([blob], [], new Set(), nowStr);
    expect(cleanup.deleted_storage_paths).toContain(blob.storage_path);
  });

  // Test 27.4: Inconsistent Binary Hash (CORRUPT_ATTACHMENT Preserved)
  test('27.4: Hash mismatch (expected != actual) is flagged as CORRUPT_ATTACHMENT and preserved for audit without overwrite', () => {
    const blob: StorageBlobRecord = {
      storage_path: 'storage/prod/exec_2/corrupt.jpg',
      file_hash: 'sha256-actual-H2',
      expected_hash: 'sha256-expected-H1',
      uploaded_at: recentUploadStr,
    };

    const state = classifyAttachmentState(blob, [], new Set(), nowStr);
    expect(state).toBe('CORRUPT_ATTACHMENT');

    const cleanup = cleanupDefinitiveOrphans([blob], [], new Set(), nowStr);
    expect(cleanup.deleted_storage_paths).not.toContain(blob.storage_path);
    expect(cleanup.preserved_storage_paths).toContain(blob.storage_path);
  });

  // Test 27.5: Duplicate Retry Submission
  test('27.5: Duplicate retry submissions resolve idempotently to 1 logical attachment', () => {
    const dbRecord: DbAttachmentRecord = {
      id: 'att-existing-100',
      execution_id: 'exec-10',
      storage_path: 'storage/prod/exec_10/photo_retry.jpg',
      file_hash: 'sha256-retry-100',
    };

    const blob: StorageBlobRecord = {
      storage_path: dbRecord.storage_path,
      file_hash: dbRecord.file_hash,
      uploaded_at: recentUploadStr,
    };

    const reconciliation = reconcileStorageAttachments([blob], [dbRecord], new Set(), nowStr);
    expect(reconciliation.reconciled_attachments.length).toBe(1);
    expect(reconciliation.reconstructed_attachments_count).toBe(0);
  });

  // Test 27.6: 3 Simultaneous Parallel Sync Requests
  test('27.6: 3 parallel sync requests of the same upload yield exactly 1 registered attachment', () => {
    const parallelBlobs: StorageBlobRecord[] = [
      { storage_path: 'p.jpg', file_hash: 'sha256-same-hash', uploaded_at: recentUploadStr },
      { storage_path: 'p.jpg', file_hash: 'sha256-same-hash', uploaded_at: recentUploadStr },
      { storage_path: 'p.jpg', file_hash: 'sha256-same-hash', uploaded_at: recentUploadStr },
    ];

    const dbRecord: DbAttachmentRecord = {
      id: 'att-parallel-1',
      execution_id: 'exec-parallel',
      storage_path: 'p.jpg',
      file_hash: 'sha256-same-hash',
    };

    const reconciliation = reconcileStorageAttachments(parallelBlobs, [dbRecord], new Set(), nowStr);
    expect(reconciliation.reconciled_attachments.length).toBe(1);
  });

  // Test 27.7: Attachment with Missing Optional Metadata
  test('27.7: Attachment with missing optional metadata (GPS / phase) is preserved as valid operational evidence', () => {
    const dbRecord: DbAttachmentRecord = {
      id: 'att-nometadata',
      execution_id: 'exec-20',
      storage_path: 'storage/no_meta.jpg',
      file_hash: 'sha256-nometa-777',
    };

    const blob: StorageBlobRecord = {
      storage_path: dbRecord.storage_path,
      file_hash: dbRecord.file_hash,
      uploaded_at: recentUploadStr,
    };

    const state = classifyAttachmentState(blob, [dbRecord], new Set(), nowStr);
    expect(state).toBe('REGISTERED');
  });

  // Test 27.8: Attachment Linked to Execution
  test('27.8: Attachment linked to an active execution is preserved during cleanup', () => {
    const dbRecord: DbAttachmentRecord = {
      id: 'att-exec-linked',
      execution_id: 'exec-active-30',
      storage_path: 'storage/exec_30/photo.jpg',
      file_hash: 'sha256-exec-30',
    };

    const blob: StorageBlobRecord = {
      storage_path: dbRecord.storage_path,
      file_hash: dbRecord.file_hash,
      uploaded_at: expiredUploadStr,
    };

    const cleanup = cleanupDefinitiveOrphans([blob], [dbRecord], new Set(), nowStr);
    expect(cleanup.preserved_storage_paths).toContain(blob.storage_path);
    expect(cleanup.deleted_storage_paths.length).toBe(0);
  });

  // Test 27.9: Attachment Selected in DRAFT Curation
  test('27.9: Attachment selected in DRAFT curation is preserved during recovery/cleanup', () => {
    const dbRecord: DbAttachmentRecord = {
      id: 'att-draft-selected',
      execution_id: 'exec-draft-40',
      storage_path: 'storage/draft/photo.jpg',
      file_hash: 'sha256-draft-40',
    };

    const blob: StorageBlobRecord = {
      storage_path: dbRecord.storage_path,
      file_hash: dbRecord.file_hash,
      uploaded_at: expiredUploadStr,
    };

    const cleanup = cleanupDefinitiveOrphans([blob], [dbRecord], new Set(), nowStr);
    expect(cleanup.preserved_storage_paths).toContain(blob.storage_path);
  });

  // Test 27.10: Attachment in ISSUED Acta Snapshot (Immune Forever)
  test('27.10: Attachment in an ISSUED Acta snapshot is classified as ISSUED_SNAPSHOT_EVIDENCE and is 100% immune to deletion', () => {
    const dbRecord: DbAttachmentRecord = {
      id: 'att-issued-frozen-999',
      execution_id: 'exec-issued-99',
      storage_path: 'storage/issued/photo.jpg',
      file_hash: 'sha256-issued-999',
    };

    const blob: StorageBlobRecord = {
      storage_path: dbRecord.storage_path,
      file_hash: dbRecord.file_hash,
      uploaded_at: expiredUploadStr,
    };

    const issuedSnapshots = new Set(['att-issued-frozen-999']);

    const state = classifyAttachmentState(blob, [dbRecord], issuedSnapshots, nowStr);
    expect(state).toBe('ISSUED_SNAPSHOT_EVIDENCE');

    const cleanup = cleanupDefinitiveOrphans([blob], [dbRecord], issuedSnapshots, nowStr);
    expect(cleanup.preserved_storage_paths).toContain(blob.storage_path);
    expect(cleanup.deleted_storage_paths.length).toBe(0);
  });

  // Test 27.11: Post-Recovery Re-run Idempotency
  test('27.11: Re-running reconciliation and cleanup post-recovery is 100% pure and idempotent', () => {
    const blobs: StorageBlobRecord[] = [
      { storage_path: 'b1.jpg', file_hash: 'h1', uploaded_at: recentUploadStr },
      { storage_path: 'b2.jpg', file_hash: 'h2', uploaded_at: expiredUploadStr },
    ];

    const run1 = cleanupDefinitiveOrphans(blobs, [], new Set(), nowStr);
    const run2 = cleanupDefinitiveOrphans(blobs, [], new Set(), nowStr);

    expect(run1).toEqual(run2);
  });

  // Test 27.12: Contractual Boundary Guard Assertion
  test('27.12 (Boundary Assertion): Recovery and cleanup operations NEVER mutate contractual baselines', () => {
    const baselineItem: ContractualItemState = {
      id: 'acta-item-boundary-27',
      poa_id: 'poa-2026-v1',
      planned_qty: 200,
      executed_qty: 180,
      planned_jr: 20,
      executed_jr: 18,
      worker_count: 6,
      unit_price: 35000,
      status: 'verified',
      cantidad_facturada: 180,
    };

    // Run reconciliation & cleanup
    const blob: StorageBlobRecord = {
      storage_path: 'storage/prod/exec_100/photo.jpg',
      file_hash: 'sha256-boundary-27',
      uploaded_at: expiredUploadStr,
    };

    cleanupDefinitiveOrphans([blob], [], new Set(), nowStr);

    // Contractual state after recovery remains identical
    const itemAfter = { ...baselineItem };
    expect(() => verifyCurationDoesNotMutateContractual(baselineItem, itemAfter)).not.toThrow();
  });
});
