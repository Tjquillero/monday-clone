/**
 * Storage Attachment Lifecycle & Recovery Evaluator
 * Production Readiness Gate v1 — Phase 2: Test 27
 * 
 * Implements the attachment lifecycle state machine:
 * - REGISTERED: Attached to an execution in DB.
 * - TEMPORARY_ORPHAN: Blob in Storage, DB record missing, age < reconciliation_window (24h). Protected.
 * - DEFINITIVE_ORPHAN: Blob in Storage, DB record missing, age >= reconciliation_window, no refs. Safe to clean.
 * - CORRUPT_ATTACHMENT: Hash mismatch (expected != actual). Preserved for audit, never overwritten.
 * - ISSUED_SNAPSHOT_EVIDENCE: Included in an ISSUED Acta snapshot. 100% immune to deletion.
 */

export type AttachmentLifecycleState =
  | 'REGISTERED'
  | 'TEMPORARY_ORPHAN'
  | 'DEFINITIVE_ORPHAN'
  | 'CORRUPT_ATTACHMENT'
  | 'ISSUED_SNAPSHOT_EVIDENCE';

export interface StorageBlobRecord {
  storage_path: string;
  file_hash: string;
  uploaded_at: string;
  expected_hash?: string;
  has_pending_reference?: boolean;
}

export interface DbAttachmentRecord {
  id: string;
  execution_id: string;
  storage_path: string;
  file_hash: string;
  phase?: 'before' | 'after';
  captured_at?: string;
  created_at?: string;
}

export interface ReconciliationConfig {
  reconciliation_window_seconds: number; // default: 86400 (24h)
}

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  reconciliation_window_seconds: 86400,
};

/**
 * Classifies a Storage Blob into its formal lifecycle state.
 */
export function classifyAttachmentState(
  blob: StorageBlobRecord,
  dbRecords: DbAttachmentRecord[],
  issuedSnapshotsAttachmentIds: Set<string>,
  nowTimestamp = '2026-09-03T19:00:00Z',
  config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG
): AttachmentLifecycleState {
  const dbMatch = dbRecords.find(
    (db) => db.storage_path === blob.storage_path || db.file_hash === blob.file_hash
  );

  // 1. Check if linked to an ISSUED Acta Snapshot -> Immune forever
  if (dbMatch && issuedSnapshotsAttachmentIds.has(dbMatch.id)) {
    return 'ISSUED_SNAPSHOT_EVIDENCE';
  }

  // 2. Check for physical/metadata hash corruption -> Preserved for audit
  if (blob.expected_hash && blob.expected_hash !== blob.file_hash) {
    return 'CORRUPT_ATTACHMENT';
  }

  // 3. Registered attachment in DB
  if (dbMatch) {
    return 'REGISTERED';
  }

  // 4. DB Record Missing -> Evaluate Orphan Age
  const nowMs = Date.parse(nowTimestamp);
  const uploadedMs = Date.parse(blob.uploaded_at);
  const ageSeconds = Math.max(0, (nowMs - uploadedMs) / 1000);

  if (blob.has_pending_reference || ageSeconds < config.reconciliation_window_seconds) {
    return 'TEMPORARY_ORPHAN';
  }

  return 'DEFINITIVE_ORPHAN';
}

export interface ReconciliationResult {
  total_blobs_scanned: number;
  reconciled_attachments: DbAttachmentRecord[];
  classified_states: Record<string, AttachmentLifecycleState>;
  reconstructed_attachments_count: number;
  corrupt_attachments_count: number;
}

/**
 * Reconciles Storage Blobs against DB records and pending uploads.
 * Restores missing DB references for valid Blobs without re-uploading bytes.
 */
export function reconcileStorageAttachments(
  blobs: StorageBlobRecord[],
  dbRecords: DbAttachmentRecord[],
  issuedSnapshotsAttachmentIds: Set<string>,
  nowTimestamp = '2026-09-03T19:00:00Z',
  config = DEFAULT_RECONCILIATION_CONFIG
): ReconciliationResult {
  const classifiedStates: Record<string, AttachmentLifecycleState> = {};
  const reconciledAttachments = [...dbRecords];
  const existingHashes = new Set(dbRecords.map((d) => d.file_hash));
  let reconstructedCount = 0;
  let corruptCount = 0;

  for (const blob of blobs) {
    const state = classifyAttachmentState(
      blob,
      dbRecords,
      issuedSnapshotsAttachmentIds,
      nowTimestamp,
      config
    );
    classifiedStates[blob.storage_path] = state;

    if (state === 'CORRUPT_ATTACHMENT') {
      corruptCount++;
    }

    // Storage SUCCESS + DB Missing Reconciliation
    if (state === 'TEMPORARY_ORPHAN' || state === 'DEFINITIVE_ORPHAN') {
      // If blob has valid hash and execution path metadata, reconstruct DB reference idempotently
      if (blob.storage_path.includes('exec_') && !existingHashes.has(blob.file_hash)) {
        const execIdMatch = blob.storage_path.match(/exec_[^/]+/);
        const executionId = execIdMatch ? execIdMatch[0] : 'exec-unknown';

        const reconstructed: DbAttachmentRecord = {
          id: `reconstructed-${blob.file_hash.slice(0, 8)}`,
          execution_id: executionId,
          storage_path: blob.storage_path,
          file_hash: blob.file_hash,
          phase: 'after',
          captured_at: blob.uploaded_at,
          created_at: nowTimestamp,
        };

        reconciledAttachments.push(reconstructed);
        existingHashes.add(blob.file_hash);
        reconstructedCount++;
        classifiedStates[blob.storage_path] = 'REGISTERED';
      }
    }
  }

  return {
    total_blobs_scanned: blobs.length,
    reconciled_attachments: reconciledAttachments,
    classified_states: classifiedStates,
    reconstructed_attachments_count: reconstructedCount,
    corrupt_attachments_count: corruptCount,
  };
}

export interface CleanupResult {
  total_scanned: number;
  deleted_storage_paths: string[];
  preserved_storage_paths: string[];
}

/**
 * Safely cleans DEFINITIVE ORPHANS only.
 * Leaves REGISTERED, TEMPORARY_ORPHAN, CORRUPT_ATTACHMENT, and ISSUED_SNAPSHOT_EVIDENCE 100% untouched.
 */
export function cleanupDefinitiveOrphans(
  blobs: StorageBlobRecord[],
  dbRecords: DbAttachmentRecord[],
  issuedSnapshotsAttachmentIds: Set<string>,
  nowTimestamp = '2026-09-03T19:00:00Z',
  config = DEFAULT_RECONCILIATION_CONFIG
): CleanupResult {
  const deletedPaths: string[] = [];
  const preservedPaths: string[] = [];

  for (const blob of blobs) {
    const state = classifyAttachmentState(
      blob,
      dbRecords,
      issuedSnapshotsAttachmentIds,
      nowTimestamp,
      config
    );

    if (state === 'DEFINITIVE_ORPHAN') {
      deletedPaths.push(blob.storage_path);
    } else {
      preservedPaths.push(blob.storage_path);
    }
  }

  return {
    total_scanned: blobs.length,
    deleted_storage_paths: deletedPaths,
    preserved_storage_paths: preservedPaths,
  };
}
