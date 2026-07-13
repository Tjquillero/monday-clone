import type { SupabaseClient } from '@supabase/supabase-js';

// DomainTools del comparador de versiones del POA. Responde ÚNICAMENTE
// "¿qué cambió?" entre dos versiones — nunca "¿qué efecto tuvo?" (eso
// combina esto con get_board_summary/get_pending_billable_work desde el
// Orchestrator, no se mezcla aquí). Precio unitario cambiando entre
// versiones NO es una anomalía (poa-domain.md Regla 9, ADR-0003) — se
// reporta al mismo nivel que un cambio de cantidad.

export interface ActivityZoneChange {
  activityKey: string;
  zoneName: string;
}

export interface QuantityChange {
  activityKey: string;
  zoneName: string;
  oldQuantity: number;
  newQuantity: number;
}

export interface PriceChange {
  activityKey: string;
  oldPrice: number;
  newPrice: number;
}

export interface PoaVersionDiffDto {
  poaId: string;
  fromVersion: number;
  toVersion: number;
  added: ActivityZoneChange[];
  removed: ActivityZoneChange[];
  quantityChanges: QuantityChange[];
  priceChanges: PriceChange[];
}

export async function getPoaVersionDiff(
  supabase: SupabaseClient,
  poaId: string,
  fromVersion: number,
  toVersion: number
): Promise<PoaVersionDiffDto> {
  const { data, error } = await supabase.rpc('get_poa_version_diff', {
    p_poa_id: poaId,
    p_from_version: fromVersion,
    p_to_version: toVersion,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    change_type: string;
    activity_key: string;
    zone_name: string | null;
    old_quantity: number | null;
    new_quantity: number | null;
    old_price: number | null;
    new_price: number | null;
  }>;

  const added: ActivityZoneChange[] = [];
  const removed: ActivityZoneChange[] = [];
  const quantityChanges: QuantityChange[] = [];
  const priceChanges: PriceChange[] = [];

  for (const row of rows) {
    if (row.change_type === 'added') {
      added.push({ activityKey: row.activity_key, zoneName: row.zone_name! });
    } else if (row.change_type === 'removed') {
      removed.push({ activityKey: row.activity_key, zoneName: row.zone_name! });
    } else if (row.change_type === 'quantity_changed') {
      quantityChanges.push({
        activityKey: row.activity_key,
        zoneName: row.zone_name!,
        oldQuantity: row.old_quantity!,
        newQuantity: row.new_quantity!,
      });
    } else if (row.change_type === 'price_changed') {
      priceChanges.push({
        activityKey: row.activity_key,
        oldPrice: row.old_price!,
        newPrice: row.new_price!,
      });
    }
  }

  return { poaId, fromVersion, toVersion, added, removed, quantityChanges, priceChanges };
}
