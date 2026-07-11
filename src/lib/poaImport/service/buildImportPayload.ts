// =============================================================================
// buildImportPayload — función pura: ValidatedActivity[] (capas 1-3, ya
// resuelto — cada zona ya trae su group_id real, la resolución ocurrió
// DENTRO de validateParsedPoa vía el context inyectado) -> el JSON exacto
// que espera import_poa_version() (docs/architecture/import-poa-version-
// contract.md). Solo traduce forma (camelCase -> snake_case) — no consulta
// Supabase, no aplica ninguna regla nueva.
// =============================================================================

import type { ValidatedActivity } from '../types';

export interface ImportPayloadZone {
  group_id: string;
  cantidad_contratada: number;
}

export interface ImportPayloadActivity {
  activity_key: string;
  precio_unitario: number;
  frecuencia: number;
  zonas: ImportPayloadZone[];
}

export function buildImportPayload(activities: ValidatedActivity[]): ImportPayloadActivity[] {
  return activities.map((activity) => ({
    activity_key: activity.activityKey,
    precio_unitario: activity.precioUnitario,
    frecuencia: activity.frecuencia,
    zonas: activity.zonas.map((zone) => ({
      group_id: zone.groupId,
      cantidad_contratada: zone.cantidadContratada,
    })),
  }));
}
