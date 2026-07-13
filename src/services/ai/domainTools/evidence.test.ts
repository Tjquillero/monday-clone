import { getExecutionsWithoutEvidence, getExecutionAttachments } from './evidence';

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
  it('mapea las filas de la RPC al DTO (camelCase)', async () => {
    const supabase = mockSupabase([
      { file_url: 'https://example.test/a.jpg', file_name: 'a.jpg', file_type: 'image/jpeg' },
    ]);

    const dto = await getExecutionAttachments(supabase, 'exec-1');

    expect(dto).toEqual([{ fileUrl: 'https://example.test/a.jpg', fileName: 'a.jpg', fileType: 'image/jpeg' }]);
    expect(supabase.rpc).toHaveBeenCalledWith('get_execution_attachments', { p_execution_id: 'exec-1' });
  });

  it('devuelve un arreglo vacío cuando la ejecución no tiene fotos', async () => {
    const supabase = mockSupabase([]);
    const dto = await getExecutionAttachments(supabase, 'exec-1');
    expect(dto).toEqual([]);
  });
});
