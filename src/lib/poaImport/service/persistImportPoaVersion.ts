// =============================================================================
// persistImportPoaVersion — segunda (y última) frontera de infraestructura
// del servicio: invoca la RPC import_poa_version() vía Supabase. No
// construye el payload (buildImportPayload, función pura, ya lo hizo) ni
// traduce el error (translatePersistenceError, función pura, lo hace
// después) — solo llama a la función SQL y propaga su resultado o su error
// tal cual, sin envolverlo.
// Ref: docs/architecture/import-poa-version-contract.md
// =============================================================================

import { supabase } from '@/lib/supabaseClient';
import type { ImportPayloadActivity } from './buildImportPayload';

export async function persistImportPoaVersion(
  poaId: string,
  activities: ImportPayloadActivity[],
  importOperationId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('import_poa_version', {
    p_poa_id: poaId,
    p_activities: activities,
    p_import_operation_id: importOperationId,
  });

  if (error) throw error;
  return data as string;
}
