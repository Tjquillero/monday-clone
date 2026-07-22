// =============================================================================
// persistResourceAnalysisImport — frontera de infraestructura del
// Incremento 4: hace el UPSERT real hacia `resource_analysis`. No decide qué
// sitios importar (buildImportPayload, función pura, ya lo hizo) — solo
// escribe.
//
// REPLACE completo de scope_data (contrato congelado, ver service/types.ts):
// el valor que llega en `site.scopeData` reemplaza el de la fila entera, no
// se mergea con lo que hubiera antes.
//
// workers_data/wages_data NUNCA se incluyen con datos del Excel. Para una
// fila nueva (sitio sin resource_analysis previo) se inicializan a los
// mismos valores "vacíos" que ya usa el formulario manual
// (ResourceEfficiencyWidget.tsx: workers_data={}, wages_data=0) — no
// vienen del Excel, son el estado inicial neutro antes de que un humano los
// cargue. Para una fila existente, simplemente no se incluyen en el
// payload — el UPSERT con onConflict deja esas columnas intactas.
// =============================================================================

import { supabase } from '@/lib/supabaseClient';
import type { ImportPayloadSite } from './types';

/** site_id de las filas de resource_analysis que YA existen para este board — para clasificar imported vs. updated. */
export async function fetchExistingSiteIds(boardId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('resource_analysis').select('site_id').eq('board_id', boardId);
  if (error) throw error;
  return new Set((data ?? []).map((row: { site_id: string }) => row.site_id));
}

export async function upsertResourceAnalysisSite(
  boardId: string,
  site: ImportPayloadSite,
  isNew: boolean,
): Promise<void> {
  const payload: Record<string, unknown> = {
    board_id: boardId,
    site_id: site.groupId,
    scope_data: site.scopeData,
    updated_at: new Date().toISOString(),
  };
  if (isNew) {
    payload.workers_data = {};
    payload.wages_data = 0;
  }

  const { error } = await supabase.from('resource_analysis').upsert(payload, { onConflict: 'board_id,site_id' });
  if (error) throw error;
}
