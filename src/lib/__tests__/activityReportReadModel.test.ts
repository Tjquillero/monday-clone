/**
 * Activity Report Read Model Unit Test Suite
 * Evidence Layer del Acta (Soporte de Ejecución, Evidencia y Certificados)
 * 
 * Verifies the 18 test matrix requirements for the Read Model contract.
 * 0 DDL, 0 DB mutations, 100% read-only domain & service layer.
 */

import {
  buildActivityExecutionReportDTO,
  isEligibleExecutionStatus,
  mapAttachmentToEvidenceDTO,
  ActivityExecutionReportDTO,
} from '../activityReportReadModelService';
import { extractCuratedEvidencePair, ExecutionAttachmentItem } from '../evidenceCuration';
import { resolveReportAssetUrls } from '../activityReportAssetResolver';

describe('Activity Report Read Model & Evidence Layer (18 Requirements Matrix)', () => {
  const mockAttachments: ExecutionAttachmentItem[] = [
    {
      id: 'att-b1',
      execution_id: 'exec-1',
      storage_path: 'execution/exec-1/b1.jpg',
      file_hash: 'hash-b1',
      phase: 'before',
      captured_at: '2026-09-10T08:00:00.000Z',
      has_gps: true,
      sharpness_score: 0.9,
    },
    {
      id: 'att-b2',
      execution_id: 'exec-1',
      storage_path: 'execution/exec-1/b2.jpg',
      file_hash: 'hash-b2',
      phase: 'before',
      captured_at: '2026-09-10T08:05:00.000Z',
      has_gps: false,
      sharpness_score: 0.7,
    },
    {
      id: 'att-a1',
      execution_id: 'exec-1',
      storage_path: 'execution/exec-1/a1.jpg',
      file_hash: 'hash-a1',
      phase: 'after',
      captured_at: '2026-09-10T16:00:00.000Z',
      has_gps: true,
      sharpness_score: 0.95,
    },
    {
      id: 'att-a2',
      execution_id: 'exec-1',
      storage_path: 'execution/exec-1/a2.jpg',
      file_hash: 'hash-a2',
      phase: 'after',
      captured_at: '2026-09-10T16:05:00.000Z',
      has_gps: true,
      sharpness_score: 0.85,
    },
  ];

  // 1. Eligible execution with BEFORE + AFTER photos yields full pair
  test('1. Eligible execution with BEFORE + AFTER photos yields full pair in DTO (<=2 per phase)', () => {
    const pair = extractCuratedEvidencePair(mockAttachments, 2);
    expect(pair.before).toHaveLength(2);
    expect(pair.after).toHaveLength(2);
    expect(pair.before[0].id).toBe('att-b1');
    expect(pair.after[0].id).toBe('att-a1');
  });

  // 2. Execution with only BEFORE photos yields after: []
  test('2. Execution with only BEFORE photos yields after: []', () => {
    const onlyBefore = mockAttachments.filter((a) => a.phase === 'before');
    const pair = extractCuratedEvidencePair(onlyBefore, 2);
    expect(pair.before).toHaveLength(2);
    expect(pair.after).toHaveLength(0);
  });

  // 3. Execution with only AFTER photos yields before: []
  test('3. Execution with only AFTER photos yields before: []', () => {
    const onlyAfter = mockAttachments.filter((a) => a.phase === 'after');
    const pair = extractCuratedEvidencePair(onlyAfter, 2);
    expect(pair.before).toHaveLength(0);
    expect(pair.after).toHaveLength(2);
  });

  // 4. Execution without photos yields empty arrays
  test('4. Execution without photos yields empty arrays before: [] and after: []', () => {
    const pair = extractCuratedEvidencePair([], 2);
    expect(pair.before).toEqual([]);
    expect(pair.after).toEqual([]);
  });

  // 5. Multiple BEFORE photos: extractCuratedEvidencePair selects top scoring <=2
  test('5. Multiple BEFORE photos: extractCuratedEvidencePair selects top scoring non-redundant items (<=2)', () => {
    const extraBefore: ExecutionAttachmentItem[] = [
      ...mockAttachments.filter((a) => a.phase === 'before'),
      {
        id: 'att-b3',
        execution_id: 'exec-1',
        storage_path: 'execution/exec-1/b3.jpg',
        file_hash: 'hash-b3',
        phase: 'before',
        captured_at: '2026-09-10T08:10:00.000Z',
        has_gps: false,
        sharpness_score: 0.5,
      },
    ];
    const pair = extractCuratedEvidencePair(extraBefore, 2);
    expect(pair.before).toHaveLength(2);
    expect(pair.before.map((b) => b.id)).toEqual(['att-b1', 'att-b2']);
  });

  // 6. Multiple AFTER photos: extractCuratedEvidencePair selects top scoring <=2
  test('6. Multiple AFTER photos: extractCuratedEvidencePair selects top scoring non-redundant items (<=2)', () => {
    const extraAfter: ExecutionAttachmentItem[] = [
      ...mockAttachments.filter((a) => a.phase === 'after'),
      {
        id: 'att-a3',
        execution_id: 'exec-1',
        storage_path: 'execution/exec-1/a3.jpg',
        file_hash: 'hash-a3',
        phase: 'after',
        captured_at: '2026-09-10T16:10:00.000Z',
        has_gps: false,
        sharpness_score: 0.4,
      },
    ];
    const pair = extractCuratedEvidencePair(extraAfter, 2);
    expect(pair.after).toHaveLength(2);
    expect(pair.after.map((a) => a.id)).toEqual(['att-a1', 'att-a2']);
  });

  // 7. Duplicates by file_hash: engine prioritizes unique hashes
  test('7. Duplicates by file_hash: engine prioritizes unique binary hashes', () => {
    const duplicateList: ExecutionAttachmentItem[] = [
      ...mockAttachments,
      {
        id: 'att-b1-dup',
        execution_id: 'exec-1',
        storage_path: 'execution/exec-1/b1-dup.jpg',
        file_hash: 'hash-b1', // Identical binary hash
        phase: 'before',
        captured_at: '2026-09-10T08:00:00.000Z',
      },
    ];
    const pair = extractCuratedEvidencePair(duplicateList, 2);
    expect(pair.before.map((b) => b.id)).not.toContain('att-b1-dup');
  });

  // 8. Rejected execution: isEligibleExecutionStatus returns false
  test('8. Rejected execution (verification_status = rejected): excluded from eligibility', () => {
    expect(isEligibleExecutionStatus('verified')).toBe(true);
    expect(isEligibleExecutionStatus('confirmed')).toBe(true);
    expect(isEligibleExecutionStatus('closed')).toBe(true);
    expect(isEligibleExecutionStatus('rejected')).toBe(false);
    expect(isEligibleExecutionStatus('reported')).toBe(false);
    expect(isEligibleExecutionStatus('evidence_pending')).toBe(false);
    expect(isEligibleExecutionStatus(null)).toBe(false);
  });

  // Mock Supabase Builder Helper
  function createMockSupabase(overrides: {
    actaState?: 'draft' | 'issued';
    issuedAt?: string;
    sources?: any[];
    executions?: any[];
    attachments?: any[];
  }) {
    const estado = overrides.actaState || 'issued';
    const issuedAt = overrides.issuedAt || '2026-09-15T12:00:00.000Z';

    return {
      from: (table: string) => {
        if (table === 'actas') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'acta-100',
                    board_id: 'board-1',
                    numero: 38,
                    estado,
                    fecha: '2026-09-15',
                    issued_at: issuedAt,
                    created_at: '2026-09-01T00:00:00.000Z',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'boards') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'board-1',
                    name: 'Playa Salgar - Sector Norte',
                    settings: { contract_number: 'CONTRATO-038-2023' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'acta_item_sources') {
          return {
            select: () => ({
              eq: async () => ({
                data: overrides.sources || [
                  {
                    id: 'src-1',
                    acta_item_id: 'item-1',
                    execution_id: 'exec-1',
                    cantidad_consumida: 1500,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'weekly_plan_item_executions') {
          return {
            select: () => {
              const execs = overrides.executions || [
                {
                  id: 'exec-1',
                  weekly_plan_item_id: 'wpi-1',
                  board_id: 'board-1',
                  execution_date: '2026-09-10',
                  executed_qty: 1500,
                  verification_status: 'verified',
                  status: 'verified',
                  weekly_plan_items: {
                    id: 'wpi-1',
                    name: 'Perfilado y conformación de playa',
                    unit: 'M²',
                    activity_key: 'ACT-PERFILADO',
                    group_id: 'grp-1',
                    weekly_plans: {
                      id: 'wp-1',
                      site_id: 'site-1',
                      sites: { name: 'Sector Salgar Norte' },
                    },
                    groups: { title: 'Frente 01 - Costa' },
                  },
                },
              ];

              return {
                in: async () => ({ data: execs, error: null }),
                eq: () => ({
                  gte: () => ({
                    lte: async () => ({ data: execs, error: null }),
                  }),
                }),
              };
            },
          };
        }
        if (table === 'execution_attachments') {
          return {
            select: () => ({
              in: async () => ({
                data: overrides.attachments || [
                  {
                    id: 'att-b1',
                    execution_id: 'exec-1',
                    file_name: 'before.jpg',
                    file_url: 'execution/exec-1/before.jpg',
                    file_type: 'image/jpeg',
                    file_size: 204800,
                    created_at: '2026-09-10T08:00:00.000Z',
                    phase: 'before',
                    file_hash: 'hash-b1',
                  },
                  {
                    id: 'att-a1',
                    execution_id: 'exec-1',
                    file_name: 'after.jpg',
                    file_url: 'execution/exec-1/after.jpg',
                    file_type: 'image/jpeg',
                    file_size: 204800,
                    created_at: '2026-09-10T16:00:00.000Z',
                    phase: 'after',
                    file_hash: 'hash-a1',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'board_members') {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { role: 'project_director', user_id: 'user-1', users: { full_name: 'Ing. Carlos Mendoza' } },
                  { role: 'interventor', user_id: 'user-2', users: { full_name: 'Arq. Lucía Fernández' } },
                ],
                error: null,
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
      },
    };
  }

  // 9. Lineage Acta -> acta_item_sources -> execution respected in Modo Acta
  test('9. Lineage Acta -> acta_item_sources -> execution respected in Modo Acta', async () => {
    const mockSupabase = createMockSupabase({});
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);

    expect(dto.header.acta_number).toBe('38');
    expect(dto.fronts).toHaveLength(1);
    expect(dto.fronts[0].activities).toHaveLength(1);
    expect(dto.fronts[0].activities[0].execution_id).toBe('exec-1');
  });

  // 10. Inclusion of PDF disposition certificates (execution_attachments with PDF file_type)
  test('10. Inclusion of PDF disposition certificates (execution_attachments with application/pdf)', async () => {
    const mockSupabase = createMockSupabase({
      attachments: [
        {
          id: 'pdf-cert-1',
          execution_id: 'exec-1',
          file_name: 'Certificado_Vertimiento_038.pdf',
          file_url: 'execution/exec-1/Certificado_Vertimiento_038.pdf',
          file_type: 'application/pdf',
          created_at: '2026-09-10T17:00:00.000Z',
        },
      ],
    });
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    const act = dto.fronts[0].activities[0];
    expect(act.documents).toBeDefined();
    expect(act.documents).toHaveLength(1);
    expect(act.documents![0].file_name).toBe('Certificado_Vertimiento_038.pdf');
  });

  // 11. executed_qty preserved from physical execution record without alteration
  test('11. executed_qty preserved from physical execution record without alteration', async () => {
    const mockSupabase = createMockSupabase({});
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    expect(dto.fronts[0].activities[0].executed_qty).toBe(1500);
  });

  // 12. certified_qty preserved from acta_item_sources.cantidad_consumida independently
  test('12. certified_qty preserved from acta_item_sources.cantidad_consumida independently', async () => {
    const mockSupabase = createMockSupabase({
      sources: [
        {
          id: 'src-1',
          acta_item_id: 'item-1',
          execution_id: 'exec-1',
          cantidad_consumida: 1200, // Certified is 1200 while executed is 1500
        },
      ],
    });
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    const act = dto.fronts[0].activities[0];
    expect(act.executed_qty).toBe(1500);
    expect(act.certified_qty).toBe(1200);
    expect(act.executed_qty).not.toBe(act.certified_qty);
  });

  // 13. Modo Período does not introduce certified_qty (certified_qty is undefined)
  test('13. Modo Período does not introduce certified_qty (certified_qty is undefined)', async () => {
    const mockSupabase = createMockSupabase({});
    const dto = await buildActivityExecutionReportDTO(
      { mode: 'period', board_id: 'board-1', period_start: '2026-09-01', period_end: '2026-09-30' },
      mockSupabase
    );
    expect(dto.fronts[0].activities[0].certified_qty).toBeUndefined();
  });

  // 14. Acta DRAFT identifies as preliminary projection (is_draft: true)
  test('14. Acta DRAFT identifies as preliminary projection (is_draft: true)', async () => {
    const mockSupabase = createMockSupabase({ actaState: 'draft' });
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    expect(dto.header.is_draft).toBe(true);
  });

  // 15. Acta ISSUED applies immutable filter created_at <= actas.issued_at excluding post-issuance attachments
  test('15. Acta ISSUED applies immutable filter created_at <= actas.issued_at excluding post-issuance attachments', async () => {
    const mockSupabase = createMockSupabase({
      actaState: 'issued',
      issuedAt: '2026-09-12T12:00:00.000Z',
      attachments: [
        {
          id: 'att-b1',
          execution_id: 'exec-1',
          file_name: 'before.jpg',
          file_url: 'execution/exec-1/before.jpg',
          file_type: 'image/jpeg',
          created_at: '2026-09-10T08:00:00.000Z', // Before issuance
          phase: 'before',
        },
        {
          id: 'att-post-issued',
          execution_id: 'exec-1',
          file_name: 'late_after.jpg',
          file_url: 'execution/exec-1/late_after.jpg',
          file_type: 'image/jpeg',
          created_at: '2026-09-15T08:00:00.000Z', // Uploaded AFTER issuance date (2026-09-12)
          phase: 'after',
        },
      ],
    });
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    const act = dto.fronts[0].activities[0];
    expect(act.evidence.before).toHaveLength(1);
    expect(act.evidence.after).toHaveLength(0); // Post-issued attachment strictly excluded
  });

  // 16. Grouping by fronts[] -> activities[] using authoritative precedences without text heuristics
  test('16. Grouping by fronts[] -> activities[] using authoritative precedences without text heuristics', async () => {
    const mockSupabase = createMockSupabase({});
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    expect(dto.fronts[0].site_name).toBe('Sector Salgar Norte');
    expect(dto.fronts[0].front_name).toBe('Frente 01 - Costa');
  });

  // 17. Absolute determinism of DTO (deepEqual guaranteed for identical inputs)
  test('17. Absolute determinism of DTO (deepEqual guaranteed for identical inputs)', async () => {
    const mockSupabase1 = createMockSupabase({});
    const mockSupabase2 = createMockSupabase({});
    const dto1 = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase1);
    const dto2 = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase2);
    expect(dto1).toEqual(dto2);
  });

  // 18. Asset Resolver maps storage_path to signed_url without altering DTO structure
  test('18. Asset Resolver maps storage_path to signed_url without altering DTO structure', async () => {
    const mockSupabase = createMockSupabase({});
    const dto = await buildActivityExecutionReportDTO({ mode: 'acta', acta_id: 'acta-100' }, mockSupabase);
    const resolved = await resolveReportAssetUrls(dto, mockSupabase, 3600);

    expect(resolved.fronts[0].activities[0].evidence.before[0].signed_url).toBe('execution/exec-1/before.jpg');
  });
});
