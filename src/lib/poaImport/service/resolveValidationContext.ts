// =============================================================================
// resolveValidationContext — Commit 3/5: única frontera de infraestructura de
// todo el servicio. Consulta poa_zone_mappings y el catálogo técnico
// (board_activity_standards) — nada más. No transforma nada hacia el
// contrato de import_poa_version() (eso es responsabilidad de
// buildImportPayload(), todavía por construir) y no aplica ninguna regla de
// negocio adicional a las que ya viven en validateParsedPoa().
//
// Es la ÚNICA implementación real de ImportPoaServiceDeps —
// defaultImportPoaService la usa directamente. El resto del servicio
// (importPoaService.ts, buildBlockedResult.ts) sigue sin ningún import de
// Supabase.
// =============================================================================

import { supabase } from '@/lib/supabaseClient';
import type { ParseResult } from '../types';
import type { ValidatePoaImportContext } from '../validate';

export async function resolveValidationContext(
  parseResult: ParseResult,
  poaId: string,
  boardId: string,
): Promise<ValidatePoaImportContext> {
  // Set antes de construir el IN(...) — protege contra un archivo con
  // filas repetidas (código de actividad duplicado, bloque de zona
  // repetido): sin esto, el IN crecería sin límite con el mismo valor
  // varias veces en vez de una sola consulta compacta.
  const zoneNames = [...new Set(parseResult.zonas.map((z) => z.excelZoneName))];
  const activityKeys = [...new Set(parseResult.actividades.map((a) => a.activityKey))];

  // Una consulta por colección, filtrada con IN — nunca una consulta por
  // cada zona o cada actividad detectada por el parser.
  const [zoneMappingsQuery, catalogQuery] = await Promise.all([
    zoneNames.length > 0
      ? supabase
          .from('poa_zone_mappings')
          .select('excel_zone_name, group_id')
          .eq('poa_id', poaId)
          .in('excel_zone_name', zoneNames)
      : Promise.resolve({ data: [] as { excel_zone_name: string; group_id: string | null }[], error: null }),
    activityKeys.length > 0
      ? supabase
          .from('board_activity_standards')
          .select('activity_key')
          .eq('board_id', boardId)
          .is('effective_to', null)
          .in('activity_key', activityKeys)
      : Promise.resolve({ data: [] as { activity_key: string }[], error: null }),
  ]);

  if (zoneMappingsQuery.error) throw zoneMappingsQuery.error;
  if (catalogQuery.error) throw catalogQuery.error;

  const zoneMappings = new Map<string, string | null>();
  for (const row of zoneMappingsQuery.data ?? []) {
    zoneMappings.set(row.excel_zone_name, row.group_id);
  }

  const knownActivityKeys = new Set<string>();
  for (const row of catalogQuery.data ?? []) {
    knownActivityKeys.add(row.activity_key);
  }

  return { zoneMappings, knownActivityKeys };
}
