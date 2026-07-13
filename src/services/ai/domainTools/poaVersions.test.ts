import { getPoaVersionDiff } from './poaVersions';

function mockSupabase(rows: unknown[]) {
  return { rpc: jest.fn().mockResolvedValue({ data: rows, error: null }) } as any;
}

describe('getPoaVersionDiff', () => {
  it('clasifica cada fila de la RPC en el balde correcto del DTO', async () => {
    const supabase = mockSupabase([
      { change_type: 'added', activity_key: 'PV_003', zone_name: 'Zona B', old_quantity: null, new_quantity: 80, old_price: null, new_price: null },
      { change_type: 'removed', activity_key: 'PV_002', zone_name: 'Zona A', old_quantity: 50, new_quantity: null, old_price: null, new_price: null },
      { change_type: 'quantity_changed', activity_key: 'PV_001', zone_name: 'Zona A', old_quantity: 100, new_quantity: 150, old_price: null, new_price: null },
      { change_type: 'price_changed', activity_key: 'PV_001', zone_name: null, old_quantity: null, new_quantity: null, old_price: 1000, new_price: 1200 },
    ]);

    const dto = await getPoaVersionDiff(supabase, 'poa-1', 1, 2);

    expect(dto).toEqual({
      poaId: 'poa-1',
      fromVersion: 1,
      toVersion: 2,
      added: [{ activityKey: 'PV_003', zoneName: 'Zona B' }],
      removed: [{ activityKey: 'PV_002', zoneName: 'Zona A' }],
      quantityChanges: [{ activityKey: 'PV_001', zoneName: 'Zona A', oldQuantity: 100, newQuantity: 150 }],
      priceChanges: [{ activityKey: 'PV_001', oldPrice: 1000, newPrice: 1200 }],
    });
    expect(supabase.rpc).toHaveBeenCalledWith('get_poa_version_diff', {
      p_poa_id: 'poa-1',
      p_from_version: 1,
      p_to_version: 2,
    });
  });

  it('devuelve baldes vacíos cuando no hay ningún cambio', async () => {
    const supabase = mockSupabase([]);
    const dto = await getPoaVersionDiff(supabase, 'poa-1', 1, 2);
    expect(dto.added).toEqual([]);
    expect(dto.removed).toEqual([]);
    expect(dto.quantityChanges).toEqual([]);
    expect(dto.priceChanges).toEqual([]);
  });

  it('propaga el error de la RPC (ej. autorización, versión inexistente)', async () => {
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'No tiene acceso a este board.' } }) } as any;
    await expect(getPoaVersionDiff(supabase, 'poa-1', 1, 2)).rejects.toEqual({ message: 'No tiene acceso a este board.' });
  });
});
