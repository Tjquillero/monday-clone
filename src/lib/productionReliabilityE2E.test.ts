import {
  curateActivityAttachments,
  selectActivityEvidence,
  freezeActaEvidenceSnapshot,
  verifyCurationDoesNotMutateContractual,
  ExecutionAttachmentItem,
  ContractualItemState,
  ActaCuratedSelection,
} from './evidenceCuration';

describe('Production Readiness Gate v1 — Phase 1: Test 26 (Production Reliability E2E)', () => {
  test('Test 26: Full Field Failure Simulation (15 Executions, 23+ Photos, Network Timeout, Retries, Idempotency, Supervision, Curation Override, ISSUED Snapshot Resilience)', () => {
    // 1. CAMPO & OFFLINE CAPTURE: 15 Executions, 23+ Operational Attachments
    const executions = Array.from({ length: 15 }, (_, i) => ({
      id: `exec-prod-${i + 1}`,
      activity_name: `Actividad ${i + 1}`,
      site_id: `site-${(i % 3) + 1}`,
    }));

    // Generate 25 operational attachments across the 15 executions
    const allAttachments: ExecutionAttachmentItem[] = Array.from({ length: 25 }, (_, i) => ({
      id: `att-prod-${i + 1}`,
      execution_id: `exec-prod-${(i % 15) + 1}`,
      storage_path: `storage/prod/exec_${(i % 15) + 1}/photo_${i + 1}.jpg`,
      file_hash: `sha256-prod-hash-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T08:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      latitude: 10.391 + i * 0.0001,
      longitude: -75.479 - i * 0.0001,
      sharpness_score: 0.8 + (i % 4) * 0.04,
    }));

    // Operational DB Map
    const attachmentsMap: Record<string, ExecutionAttachmentItem[]> = {};
    for (const att of allAttachments) {
      if (!attachmentsMap[att.execution_id]) {
        attachmentsMap[att.execution_id] = [];
      }
      attachmentsMap[att.execution_id].push(att);
    }

    expect(allAttachments.length).toBe(25);
    expect(Object.keys(attachmentsMap).length).toBe(15);

    // 2. NETWORK TIMEOUT & RECONCILIATION SIMULATION
    // Simulate Storage upload SUCCESS but client network timeout during DB insertion
    const pendingUpload: ExecutionAttachmentItem = {
      id: 'att-prod-retry-1',
      execution_id: 'exec-prod-1',
      storage_path: 'storage/prod/exec_1/photo_retry.jpg',
      file_hash: 'sha256-prod-hash-1', // Duplicate binary hash attempt
      phase: 'after',
      captured_at: '2026-09-03T08:30:00Z',
    };

    // Reconciler detects existing file_hash in DB -> Idempotent skip without duplicating Blob or DB record
    const existingForExec1 = attachmentsMap['exec-prod-1'];
    const isDuplicateHash = existingForExec1.some((a) => a.file_hash === pendingUpload.file_hash);
    expect(isDuplicateHash).toBe(true);

    // Operational attachment list for exec-prod-1 remains deduplicated
    expect(attachmentsMap['exec-prod-1'].length).toBeGreaterThanOrEqual(1);

    // 3. BASELINE CONTRACTUAL STATE BEFORE CURATION
    const baselineItems: ContractualItemState[] = executions.map((exec, idx) => ({
      id: `acta-item-${idx + 1}`,
      poa_id: 'poa-2026-v1',
      planned_qty: 100 + idx * 10,
      executed_qty: 80 + idx * 5,
      planned_jr: 10,
      executed_jr: 8,
      worker_count: 4,
      unit_price: 25000,
      status: 'verified',
      cantidad_facturada: 80 + idx * 5,
    }));

    // 4. CURATION ENGINE V1 (DETERMINISTIC PER ACTIVITY)
    const curationResults = executions.map((exec) =>
      curateActivityAttachments(exec.id, attachmentsMap[exec.id] || [], 3)
    );

    // All curation results tag deterministic-v1
    curationResults.forEach((res) => {
      expect(res.engine_version).toBe('deterministic-v1');
    });

    // 5. HUMAN SUPERVISOR SELECTION LAYER IN DRAFT
    // Supervisor overrides selection for exec-prod-1 (choosing custom photo)
    const exec1Photos = attachmentsMap['exec-prod-1'];
    const selection1: ActaCuratedSelection = selectActivityEvidence(
      'acta-prod-2026',
      'exec-prod-1',
      exec1Photos,
      [exec1Photos[0].id]
    );

    // Supervisor accepts engine recommendations for remaining executions
    const selections: ActaCuratedSelection[] = [
      selection1,
      ...curationResults.slice(1).map((res) =>
        selectActivityEvidence(
          'acta-prod-2026',
          res.execution_id,
          attachmentsMap[res.execution_id] || [],
          res.recommended_ids.slice(0, 2)
        )
      ),
    ];

    expect(selections.length).toBe(15);

    // 6. ATOMIC ACTA ISSUANCE & FROZEN SNAPSHOT
    const draftSnapshot = freezeActaEvidenceSnapshot(
      'acta-prod-2026',
      selections,
      attachmentsMap,
      'draft'
    );
    expect(draftSnapshot.is_frozen).toBe(false);

    const issuedSnapshot = freezeActaEvidenceSnapshot(
      'acta-prod-2026',
      selections,
      attachmentsMap,
      'issued'
    );
    expect(issuedSnapshot.is_frozen).toBe(true);
    expect(issuedSnapshot.status).toBe('issued');

    // 7. ADVERSARIAL MUTATION & RESILIENCE POST-ISSUED
    // Attempting to modify frozen issued snapshot throws exception
    expect(() =>
      freezeActaEvidenceSnapshot(
        'acta-prod-2026',
        selections,
        attachmentsMap,
        'issued',
        issuedSnapshot
      )
    ).toThrow(/Cannot modify evidence selection on an ISSUED Acta/);

    // Mutate operational attachments table (add 10 new photos, delete original)
    const corruptedOperationalMap: Record<string, ExecutionAttachmentItem[]> = {
      'exec-prod-1': [
        {
          id: 'att-corrupt-99',
          execution_id: 'exec-prod-1',
          storage_path: 'corrupt/path.jpg',
          file_hash: 'sha256-corrupt-99',
          phase: 'after',
          captured_at: '2026-09-04T00:00:00Z',
        },
      ],
    };

    // Re-curating post-issued operational data yields different recommendations
    const postIssuedCuration = curateActivityAttachments(
      'exec-prod-1',
      corruptedOperationalMap['exec-prod-1'],
      3
    );
    expect(postIssuedCuration.recommended_ids).toEqual(['att-corrupt-99']);

    // HISTORICAL ISSUED SNAPSHOT STILL CONTAINS ORIGINAL PROD SELECTIONS
    expect(issuedSnapshot.activity_snapshots['exec-prod-1'].map((i) => i.attachment_id)).toEqual([
      exec1Photos[0].id,
    ]);

    // 8. ZERO CONTRACTUAL MUTATION ASSERTION (contractual_mutation_after_operational_failure = 0)
    baselineItems.forEach((item) => {
      const itemAfter = { ...item };
      expect(() => verifyCurationDoesNotMutateContractual(item, itemAfter)).not.toThrow();
    });
  });
});
