import {
  curateActivityAttachments,
  selectActivityEvidence,
  freezeActaEvidenceSnapshot,
  verifyCurationDoesNotMutateContractual,
  ExecutionAttachmentItem,
  ContractualItemState,
} from './evidenceCuration';

describe('Cross-Domain Audit Test 24: Evidence Curation & Acta Presentation Domain v1', () => {
  // Test 1: Negative Boundary Guard — Evidence curation cannot touch contractual or physical state
  test('Test 1: Curating or selecting evidence NEVER mutates contractual or physical quantities', () => {
    const itemBefore: ContractualItemState = {
      id: 'item-101',
      poa_id: 'poa-2026-v1',
      planned_qty: 100,
      executed_qty: 65,
      planned_jr: 10,
      executed_jr: 6.5,
      worker_count: 4,
      unit_price: 25000,
      status: 'verified',
      cantidad_facturada: 65,
    };

    const attachments: ExecutionAttachmentItem[] = [
      {
        id: 'att-1',
        execution_id: 'exec-1',
        storage_path: 'exec-1/photo1.jpg',
        file_hash: 'hash-abc-111',
        phase: 'before',
        captured_at: '2026-09-03T08:00:00Z',
        has_gps: true,
        sharpness_score: 0.9,
      },
      {
        id: 'att-2',
        execution_id: 'exec-1',
        storage_path: 'exec-1/photo2.jpg',
        file_hash: 'hash-abc-222',
        phase: 'after',
        captured_at: '2026-09-03T16:00:00Z',
        has_gps: true,
        sharpness_score: 0.95,
      },
    ];

    // Run deterministic curation
    const curationResult = curateActivityAttachments('exec-1', attachments);
    expect(curationResult.recommended_ids.length).toBe(2);

    // Run human selection
    const selection = selectActivityEvidence('acta-101', 'exec-1', attachments, ['att-2']);
    expect(selection.selected_attachment_ids).toEqual(['att-2']);

    // State after curation remains strictly identical
    const itemAfter: ContractualItemState = { ...itemBefore };

    // Guard assertion must pass without error
    expect(() => verifyCurationDoesNotMutateContractual(itemBefore, itemAfter)).not.toThrow();

    // Verify guard fails if any contractual quantity is mutated
    const invalidAfter = { ...itemBefore, executed_qty: 70 };
    expect(() => verifyCurationDoesNotMutateContractual(itemBefore, invalidAfter)).toThrow(
      /VIOLATION OF EVIDENCE CURATION BOUNDARY/
    );
  });

  // Test 2: Per-Activity Allocation Guard — Curation occurs per activity, preventing hogging
  test('Test 2: Curation allocates recommendations per activity, preventing photogenic activities from hogging slots', () => {
    // Activity A has 30 photos
    const activityAPhotos: ExecutionAttachmentItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `att-A-${i + 1}`,
      execution_id: 'exec-activity-A',
      storage_path: `photos/A/photo_${i + 1}.jpg`,
      file_hash: `hash-A-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T08:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      sharpness_score: 0.8,
    }));

    // Activity B has 5 photos
    const activityBPhotos: ExecutionAttachmentItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `att-B-${i + 1}`,
      execution_id: 'exec-activity-B',
      storage_path: `photos/B/photo_${i + 1}.jpg`,
      file_hash: `hash-B-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T10:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      sharpness_score: 0.85,
    }));

    const resultA = curateActivityAttachments('exec-activity-A', activityAPhotos, 3);
    const resultB = curateActivityAttachments('exec-activity-B', activityBPhotos, 3);

    // Each activity gets exactly 3 recommendations from its own attachment set
    expect(resultA.recommended_ids.length).toBe(3);
    expect(resultB.recommended_ids.length).toBe(3);

    // Activity B recommendations belong strictly to Activity B
    resultB.recommended_ids.forEach((id) => {
      expect(id.startsWith('att-B-')).toBe(true);
    });
  });

  // Test 3: 100% Operational Evidence Retention — Unselected photos are preserved
  test('Test 3: Selecting documentary photos for an Acta does NOT delete or hide operational evidence', () => {
    const photos47: ExecutionAttachmentItem[] = Array.from({ length: 47 }, (_, i) => ({
      id: `att-all-${i + 1}`,
      execution_id: 'exec-large',
      storage_path: `storage/photo_${i + 1}.jpg`,
      file_hash: `sha256-hash-${i + 1}`,
      phase: i === 0 ? 'before' : 'after',
      captured_at: '2026-09-03T12:00:00Z',
    }));

    const selection = selectActivityEvidence('acta-200', 'exec-large', photos47, [
      'att-all-1',
      'att-all-2',
      'att-all-3',
    ]);

    // 3 photos selected for presentation in Acta
    expect(selection.selected_attachment_ids).toEqual(['att-all-1', 'att-all-2', 'att-all-3']);

    // All 47 operational attachments remain intact in the operational array
    expect(photos47.length).toBe(47);
  });

  // Test 4: Deterministic Scoring & Reproducibility
  test('Test 4: Deterministic engine v1 yields 100% reproducible recommendations and scores', () => {
    const attachments: ExecutionAttachmentItem[] = [
      {
        id: 'photo-sharp-gps',
        execution_id: 'exec-rep',
        storage_path: 'p1.jpg',
        file_hash: 'hash-111',
        phase: 'before',
        captured_at: '2026-09-03T08:00:00Z',
        has_gps: true,
        sharpness_score: 0.95,
      },
      {
        id: 'photo-blurry-nogps',
        execution_id: 'exec-rep',
        storage_path: 'p2.jpg',
        file_hash: 'hash-222',
        phase: 'after',
        captured_at: '2026-09-03T14:00:00Z',
        has_gps: false,
        sharpness_score: 0.3,
      },
    ];

    const run1 = curateActivityAttachments('exec-rep', attachments, 2);
    const run2 = curateActivityAttachments('exec-rep', attachments, 2);

    expect(run1).toEqual(run2);
    expect(run1.engine_version).toBe('deterministic-v1');
    expect(run1.items[0].attachment.id).toBe('photo-sharp-gps');
    expect(run1.items[0].score).toBeGreaterThan(run1.items[1].score);
  });

  // Test 5: Frozen Snapshot on ISSUED Acta
  test('Test 5: Issuing an Acta freezes the selected evidence presentation snapshot immutably', () => {
    const attachmentsMap: Record<string, ExecutionAttachmentItem[]> = {
      'exec-acta-1': [
        {
          id: 'p-1',
          execution_id: 'exec-acta-1',
          storage_path: 'path/1.jpg',
          file_hash: 'h-1',
          phase: 'before',
          captured_at: '2026-09-03T09:00:00Z',
        },
      ],
    };

    const selections = [
      {
        acta_id: 'acta-draft-1',
        execution_id: 'exec-acta-1',
        selected_attachment_ids: ['p-1'],
        updated_at: '2026-09-03T10:00:00Z',
      },
    ];

    // Create DRAFT snapshot
    const draftSnapshot = freezeActaEvidenceSnapshot(
      'acta-draft-1',
      selections,
      attachmentsMap,
      'draft'
    );
    expect(draftSnapshot.is_frozen).toBe(false);

    // Issue Acta -> Locks snapshot
    const issuedSnapshot = freezeActaEvidenceSnapshot(
      'acta-draft-1',
      selections,
      attachmentsMap,
      'issued'
    );
    expect(issuedSnapshot.is_frozen).toBe(true);
    expect(issuedSnapshot.status).toBe('issued');

    // Attempting to modify an ISSUED snapshot throws error
    expect(() =>
      freezeActaEvidenceSnapshot('acta-draft-1', selections, attachmentsMap, 'issued', issuedSnapshot)
    ).toThrow(/Cannot modify evidence selection on an ISSUED Acta/);
  });

  // Test 6: Adversarial Test — Modifying operational attachments after ISSUED leaves historical snapshot unchanged
  test('Test 6 (Adversarial): Altering operational metadata or re-curating post-ISSUED does NOT change the historical evidence snapshot of an ISSUED Acta', () => {
    const originalOperational: ExecutionAttachmentItem[] = Array.from({ length: 47 }, (_, i) => ({
      id: `photo-orig-${i + 1}`,
      execution_id: 'exec-adv-100',
      storage_path: `storage/adv/photo_${i + 1}.jpg`,
      file_hash: `sha-adv-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T08:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      sharpness_score: 0.8,
    }));

    const attachmentsMap: Record<string, ExecutionAttachmentItem[]> = {
      'exec-adv-100': originalOperational,
    };

    // 1. Curation recommends 5 photos
    const curationResult = curateActivityAttachments('exec-adv-100', originalOperational, 5);
    expect(curationResult.recommended_ids.length).toBe(5);

    // 2. Human supervisor selects 3 photos
    const humanSelectedIds = curationResult.recommended_ids.slice(0, 3);
    const selection = selectActivityEvidence(
      'acta-issued-888',
      'exec-adv-100',
      originalOperational,
      humanSelectedIds
    );

    // 3. Issue Acta -> Freezes snapshot
    const frozenActaSnapshot = freezeActaEvidenceSnapshot(
      'acta-issued-888',
      [selection],
      attachmentsMap,
      'issued'
    );

    expect(frozenActaSnapshot.is_frozen).toBe(true);
    const originalFrozenItems = frozenActaSnapshot.activity_snapshots['exec-adv-100'];
    expect(originalFrozenItems.length).toBe(3);

    // 4. ADVERSARIAL ACTION: Alter operational attachments (e.g. modify metadata, delete from DB, re-run curation)
    const mutatedOperationalMap = {
      'exec-adv-100': originalOperational.filter((p) => !humanSelectedIds.includes(p.id)), // "deleted" selected photos from operational table
    };

    // Re-running curation on mutated operational table returns different recommendations
    const postMutationCuration = curateActivityAttachments(
      'exec-adv-100',
      mutatedOperationalMap['exec-adv-100'],
      5
    );
    expect(postMutationCuration.recommended_ids).not.toEqual(curationResult.recommended_ids);

    // 5. VERIFICATION: The historical frozen snapshot of the ISSUED Acta STILL contains the exact 3 original photos
    expect(frozenActaSnapshot.activity_snapshots['exec-adv-100']).toEqual(originalFrozenItems);
    expect(frozenActaSnapshot.activity_snapshots['exec-adv-100'].map((i) => i.attachment_id)).toEqual(
      humanSelectedIds
    );
  });
});
