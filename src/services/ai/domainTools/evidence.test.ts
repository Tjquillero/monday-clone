import { getExecutionsWithoutEvidence, getExecutionAttachments, getDuplicateAttachments } from './evidence';

function mockSupabase(rows: unknown[]) {
  return { rpc: jest.fn().mockResolvedValue({ data: rows, error: null }) } as any;
}

describe('getExecutionsWithoutEvidence', () => {
  it('mapea las filas de la RPC al DTO (camelCase)', async () => {
    const supabase = mockSupabase([
      {
        execution_id: 'exec-1',
        weekly_plan_id: 'plan-1',
        activity_key: 'EV_001',
        activity_name: 'Poda de árboles',
        zone_name: 'Zona Evidencia',
        execution_date: '2026-11-09',
        plan_status: 'in_progress',
      },
    ]);

    const dto = await getExecutionsWithoutEvidence(supabase, 'board-1');

    expect(dto).toEqual([
      {
        executionId: 'exec-1',
        weeklyPlanId: 'plan-1',
        activityKey: 'EV_001',
        activityName: 'Poda de árboles',
        zoneName: 'Zona Evidencia',
        executionDate: '2026-11-09',
        planStatus: 'in_progress',
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('get_executions_without_evidence', { p_board_id: 'board-1' });
  });

  it('devuelve un arreglo vacío cuando no hay ejecuciones sin evidencia', async () => {
    const supabase = mockSupabase([]);
    const dto = await getExecutionsWithoutEvidence(supabase, 'board-1');
    expect(dto).toEqual([]);
  });

  it('propaga el error de la RPC (ej. autorización)', async () => {
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'No tiene acceso a este board.' } }) } as any;
    await expect(getExecutionsWithoutEvidence(supabase, 'board-1')).rejects.toEqual({
      message: 'No tiene acceso a este board.',
    });
  });
});

describe('getExecutionAttachments', () => {
  it('mapea las filas de la RPC al DTO (camelCase), incluyendo phase y file_hash', async () => {
    const supabase = mockSupabase([
      { file_url: 'https://example.test/a.jpg', file_name: 'a.jpg', file_type: 'image/jpeg', phase: 'before', file_hash: 'hash-a' },
      { file_url: 'https://example.test/b.jpg', file_name: 'b.jpg', file_type: 'image/jpeg', phase: null, file_hash: null },
    ]);

    const dto = await getExecutionAttachments(supabase, 'exec-1');

    expect(dto).toEqual([
      { fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg', phase: 'before', fileHash: 'hash-a' },
      { fileUrl: 'https://example.test/b.jpg', fileName: 'b.jpg', fileType: 'image/jpeg', phase: null, fileHash: null },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('get_execution_attachments', { p_execution_id: 'exec-1' });
  });

  it('devuelve un arreglo vacío cuando la ejecución no tiene fotos', async () => {
    const supabase = mockSupabase([]);
    const dto = await getExecutionAttachments(supabase, 'exec-1');
    expect(dto).toEqual([]);
  });
});

describe('getDuplicateAttachments', () => {
  it('agrupa las filas planas de la RPC por file_hash', async () => {
    const supabase = mockSupabase([
      {
        file_hash: 'hash-abc',
        execution_id: 'exec-1',
        activity_key: 'DA_001',
        activity_name: 'Poda de árboles',
        execution_date: '2026-11-02',
        file_name: 'foto1.jpg',
      },
      {
        file_hash: 'hash-abc',
        execution_id: 'exec-2',
        activity_key: 'DA_001',
        activity_name: 'Poda de árboles',
        execution_date: '2026-11-09',
        file_name: 'foto2.jpg',
      },
    ]);

    const dto = await getDuplicateAttachments(supabase, 'board-1');

    expect(dto).toEqual([
      {
        fileHash: 'hash-abc',
        occurrences: [
          { executionId: 'exec-1', activityKey: 'DA_001', activityName: 'Poda de árboles', executionDate: '2026-11-02', fileName: 'foto1.jpg' },
          { executionId: 'exec-2', activityKey: 'DA_001', activityName: 'Poda de árboles', executionDate: '2026-11-09', fileName: 'foto2.jpg' },
        ],
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('get_duplicate_attachments', { p_board_id: 'board-1' });
  });

  it('separa correctamente dos grupos de hash distintos', async () => {
    const supabase = mockSupabase([
      { file_hash: 'hash-a', execution_id: 'exec-1', activity_key: 'DA_001', activity_name: 'A', execution_date: '2026-11-02', file_name: 'a1.jpg' },
      { file_hash: 'hash-a', execution_id: 'exec-2', activity_key: 'DA_001', activity_name: 'A', execution_date: '2026-11-09', file_name: 'a2.jpg' },
      { file_hash: 'hash-b', execution_id: 'exec-3', activity_key: 'DA_002', activity_name: 'B', execution_date: '2026-11-10', file_name: 'b1.jpg' },
      { file_hash: 'hash-b', execution_id: 'exec-4', activity_key: 'DA_002', activity_name: 'B', execution_date: '2026-11-11', file_name: 'b2.jpg' },
    ]);

    const dto = await getDuplicateAttachments(supabase, 'board-1');

    expect(dto).toHaveLength(2);
    expect(dto.map((g) => g.fileHash).sort()).toEqual(['hash-a', 'hash-b']);
    expect(dto.find((g) => g.fileHash === 'hash-a')!.occurrences).toHaveLength(2);
    expect(dto.find((g) => g.fileHash === 'hash-b')!.occurrences).toHaveLength(2);
  });

  it('devuelve un arreglo vacío cuando no hay ningún duplicado', async () => {
    const supabase = mockSupabase([]);
    const dto = await getDuplicateAttachments(supabase, 'board-1');
    expect(dto).toEqual([]);
  });
});
