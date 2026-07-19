// =============================================================================
// resolveValidationContext — Commit 3/5: única frontera de infraestructura de
// todo el servicio. Consulta ÚNICAMENTE poa_zone_mappings. No transforma
// nada hacia el contrato de import_poa_version() (eso es responsabilidad de
// buildImportPayload()) y no aplica ninguna regla de negocio adicional a las
// que ya viven en validateParsedPoa().
//
// Separación de fases (2026-07-18, ver
// docs/architecture/poa-technical-catalog-decoupling.md): este archivo ya
// NO consulta board_activity_standards. El importador de POA depende
// únicamente de POA, zonas, versión y las reglas de negocio propias del
// dominio del POA — no conoce el catálogo técnico ni el Scheduler. Esa
// consulta se movió a get_missing_board_activity_standards(), invocada
// desde el Cronograma, no desde el import.
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
): Promise<ValidatePoaImportContext> {
  // Set antes de construir el IN(...) — protege contra un archivo con
  // bloques de zona repetidos: sin esto, el IN crecería sin límite con el
  // mismo valor varias veces en vez de una sola consulta compacta.
  const zoneNames = [...new Set(parseResult.zonas.map((z) => z.excelZoneName))];

  const zoneMappingsQuery =
    zoneNames.length > 0
      ? await supabase
          .from('poa_zone_mappings')
          .select('excel_zone_name, group_id')
          .eq('poa_id', poaId)
          .in('excel_zone_name', zoneNames)
      : { data: [] as { excel_zone_name: string; group_id: string | null }[], error: null };

  if (zoneMappingsQuery.error) throw zoneMappingsQuery.error;

  const zoneMappings = new Map<string, string | null>();
  for (const row of zoneMappingsQuery.data ?? []) {
    zoneMappings.set(row.excel_zone_name, row.group_id);
  }

  return { zoneMappings };
}
