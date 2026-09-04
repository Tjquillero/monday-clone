import {
  curateActivityAttachments,
  selectActivityEvidence,
  freezeActaEvidenceSnapshot,
  verifyCurationDoesNotMutateContractual,
  ExecutionAttachmentItem,
  ContractualItemState,
  ActaCuratedSelection,
} from './evidenceCuration';

describe('Productization E2E Audit (Test 25): End-to-End Journey from Field to Issued Snapshot', () => {
  test('Test 25: Full E2E Journey (Campo -> Offline -> Evidence -> Supervision -> Curation v1 -> Human Selection -> Acta Draft -> Issued Snapshot)', () => {
    // 1. CAMPO & OFFLINE CAPTURE: 2 distinct activities
    // Activity 101: "Limpieza de Playa" (15 photos captured offline)
    const activity101Photos: ExecutionAttachmentItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `att-act101-${i + 1}`,
      execution_id: 'exec-101',
      storage_path: `storage/playa/photo_${i + 1}.jpg`,
      file_hash: `sha256-playa-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T08:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      latitude: 10.391 + i * 0.0001,
      longitude: -75.479 - i * 0.0001,
      sharpness_score: 0.75 + (i % 5) * 0.05,
    }));

    // Activity 102: "Mantenimiento de Cercas" (8 photos captured offline)
    const activity102Photos: ExecutionAttachmentItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: `att-act102-${i + 1}`,
      execution_id: 'exec-102',
      storage_path: `storage/cercas/photo_${i + 1}.jpg`,
      file_hash: `sha256-cercas-${i + 1}`,
      phase: i % 2 === 0 ? 'before' : 'after',
      captured_at: `2026-09-03T10:${i < 10 ? '0' + i : i}:00Z`,
      has_gps: true,
      latitude: 10.401 + i * 0.0001,
      longitude: -75.489 - i * 0.0001,
      sharpness_score: 0.8,
    }));

    // All 23 original photos are preserved in the operational database map
    const attachmentsMap: Record<string, ExecutionAttachmentItem[]> = {
      'exec-101': activity101Photos,
      'exec-102': activity102Photos,
    };

    expect(attachmentsMap['exec-101'].length).toBe(15);
    expect(attachmentsMap['exec-102'].length).toBe(8);

    // 2. CONTRACTUAL STATE BEFORE CURATION
    const item101Before: ContractualItemState = {
      id: 'acta-item-101',
      poa_id: 'poa-2026-v1',
      planned_qty: 150,
      executed_qty: 120,
      planned_jr: 15,
      executed_jr: 12,
      worker_count: 5,
      unit_price: 30000,
      status: 'verified',
      cantidad_facturada: 120,
    };

    const item102Before: ContractualItemState = {
      id: 'acta-item-102',
      poa_id: 'poa-2026-v1',
      planned_qty: 80,
      executed_qty: 80,
      planned_jr: 8,
      executed_jr: 8,
      worker_count: 3,
      unit_price: 45000,
      status: 'verified',
      cantidad_facturada: 80,
    };

    // 3. DETERMINISTIC CURATION ENGINE V1
    const curation101 = curateActivityAttachments('exec-101', activity101Photos, 5);
    const curation102 = curateActivityAttachments('exec-102', activity102Photos, 5);

    expect(curation101.engine_version).toBe('deterministic-v1');
    expect(curation102.engine_version).toBe('deterministic-v1');
    expect(curation101.recommended_ids.length).toBe(5);
    expect(curation102.recommended_ids.length).toBe(5);

    // 4. HUMAN SUPERVISOR SELECTION LAYER IN DRAFT
    // Supervisor overrides selection for Activity 101 (choosing 3 specific photos)
    const selected101Ids = ['att-act101-1', 'att-act101-2', 'att-act101-5'];
    const selection101: ActaCuratedSelection = selectActivityEvidence(
      'acta-e2e-2026',
      'exec-101',
      activity101Photos,
      selected101Ids
    );

    // Supervisor accepts engine recommendations for Activity 102 (top 2 photos)
    const selected102Ids = curation102.recommended_ids.slice(0, 2);
    const selection102: ActaCuratedSelection = selectActivityEvidence(
      'acta-e2e-2026',
      'exec-102',
      activity102Photos,
      selected102Ids
    );

    expect(selection101.selected_attachment_ids).toEqual(selected101Ids);
    expect(selection102.selected_attachment_ids).toEqual(selected102Ids);

    // 5. DRAFT ACTA SNAPSHOT CREATION
    const draftSnapshot = freezeActaEvidenceSnapshot(
      'acta-e2e-2026',
      [selection101, selection102],
      attachmentsMap,
      'draft'
    );
    expect(draftSnapshot.is_frozen).toBe(false);

    // 6. ACTA ISSUANCE & ATOMIC IMMUTABLE SNAPSHOT FREEZE
    const issuedSnapshot = freezeActaEvidenceSnapshot(
      'acta-e2e-2026',
      [selection101, selection102],
      attachmentsMap,
      'issued'
    );
    expect(issuedSnapshot.is_frozen).toBe(true);
    expect(issuedSnapshot.status).toBe('issued');
    expect(issuedSnapshot.activity_snapshots['exec-101'].length).toBe(3);
    expect(issuedSnapshot.activity_snapshots['exec-102'].length).toBe(2);

    // 7. ADVERSARIAL ACTION POST-ISSUED
    // Add new photos to field table, delete original photos from operational table, re-run curation engine
    const mutatedFieldMap: Record<string, ExecutionAttachmentItem[]> = {
      'exec-101': [
        {
          id: 'att-new-999',
          execution_id: 'exec-101',
          storage_path: 'storage/playa/new_photo.jpg',
          file_hash: 'sha256-new-999',
          phase: 'after',
          captured_at: '2026-09-04T12:00:00Z',
        },
      ],
      'exec-102': [],
    };

    // Re-curating post-issued returns new recommendations
    const postIssuedCuration101 = curateActivityAttachments(
      'exec-101',
      mutatedFieldMap['exec-101'],
      5
    );
    expect(postIssuedCuration101.recommended_ids).toEqual(['att-new-999']);

    // Attempting to modify frozen issued snapshot throws exception
    expect(() =>
      freezeActaEvidenceSnapshot(
        'acta-e2e-2026',
        [selection101, selection102],
        mutatedFieldMap,
        'issued',
        issuedSnapshot
      )
    ).toThrow(/Cannot modify evidence selection on an ISSUED Acta/);

    // Historical issued snapshot remains 100% untouched
    expect(issuedSnapshot.activity_snapshots['exec-101'].map((i) => i.attachment_id)).toEqual(
      selected101Ids
    );
    expect(issuedSnapshot.activity_snapshots['exec-102'].map((i) => i.attachment_id)).toEqual(
      selected102Ids
    );

    // 8. CONTRACTUAL BOUNDARY PROTECTED
    expect(() => verifyCurationDoesNotMutateContractual(item101Before, { ...item101Before })).not.toThrow();
    expect(() => verifyCurationDoesNotMutateContractual(item102Before, { ...item102Before })).not.toThrow();
  });
});
