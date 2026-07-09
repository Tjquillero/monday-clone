import { ActivityStandardWithFrecuencia, ScopeMapping } from '@/types/scheduler';

// Shape que el algoritmo de cálculo del widget espera.
// Mantiene los nombres cortos (rend, freq) del STANDARD_MAPPINGS original
// para no modificar el algoritmo de cálculo.
export type ActivityRule = {
  name: string;
  unit: string;
  rend: number;
  freq: number;
  category: string;
};

// Convierte filas de board_activity_standards + activity_scope_mappings al
// Record<scope_key, ActivityRule[]> que el algoritmo de cálculo consume.
//
// Invariante: una actividad puede mapear a varios scope_keys (weight ignorado
// en v1 — todas las actividades tienen weight=1). El resultado replica
// exactamente el shape del antiguo STANDARD_MAPPINGS hardcodeado.
export function buildActivityMappings(
  standards: ActivityStandardWithFrecuencia[],
  scopeMappings: ScopeMapping[],
): Record<string, ActivityRule[]> {
  // O(1) lookup: activity_key → lista de scope_keys
  const scopeByKey = new Map<string, string[]>();
  for (const m of scopeMappings) {
    const keys = scopeByKey.get(m.activity_key) ?? [];
    keys.push(m.scope_key);
    scopeByKey.set(m.activity_key, keys);
  }

  const result: Record<string, ActivityRule[]> = {};
  for (const s of standards) {
    for (const scopeKey of scopeByKey.get(s.activity_key) ?? []) {
      (result[scopeKey] ??= []).push({
        name: s.name,
        unit: s.unit,
        rend: s.rendimiento,   // campo renombrado: rendimiento → rend
        freq: s.frecuencia,    // campo renombrado: frecuencia → freq
        category: s.category,
      });
    }
  }
  return result;
}
