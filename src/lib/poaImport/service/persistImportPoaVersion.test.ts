let mockRpc: jest.Mock;

jest.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { persistImportPoaVersion } from './persistImportPoaVersion';
import type { ImportPayloadActivity } from './buildImportPayload';

const SAMPLE_ACTIVITIES: ImportPayloadActivity[] = [
  {
    activity_key: '1.01',
    precio_unitario: 100,
    frecuencia: 1,
    zonas: [{ group_id: 'group-a', cantidad_contratada: 10 }],
  },
];

describe('persistImportPoaVersion', () => {
  beforeEach(() => {
    mockRpc = jest.fn();
  });

  it('invoca la RPC import_poa_version con los nombres de parámetro exactos del contrato SQL', async () => {
    mockRpc.mockResolvedValue({ data: 'version-abc', error: null });

    await persistImportPoaVersion('poa-1', SAMPLE_ACTIVITIES, 'op-1');

    expect(mockRpc).toHaveBeenCalledWith('import_poa_version', {
      p_poa_id: 'poa-1',
      p_activities: SAMPLE_ACTIVITIES,
      p_import_operation_id: 'op-1',
    });
  });

  it('devuelve el versionId cuando la RPC tiene éxito', async () => {
    mockRpc.mockResolvedValue({ data: 'version-abc', error: null });

    const versionId = await persistImportPoaVersion('poa-1', SAMPLE_ACTIVITIES, 'op-1');
    expect(versionId).toBe('version-abc');
  });

  it('propaga el error de la RPC tal cual, sin envolverlo — la traducción es responsabilidad de translatePersistenceError', async () => {
    const pgError = { code: '23503', message: 'violates foreign key constraint' };
    mockRpc.mockResolvedValue({ data: null, error: pgError });

    await expect(persistImportPoaVersion('poa-1', SAMPLE_ACTIVITIES, 'op-1')).rejects.toBe(pgError);
  });
});
