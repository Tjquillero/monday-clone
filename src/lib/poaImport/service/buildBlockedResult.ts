// =============================================================================
// buildBlockedResult — función pura: ValidationResult (capas 1-3) -> ImportPoaResult
// 'blocked', partiendo el errors[] plano de validate.ts en las tres
// categorías de dominio del servicio. No decide nada por su cuenta — solo
// enruta cada ImportValidationError.code a su categoría correspondiente.
// Ref: docs/architecture/import-poa-orchestrator-flow.md
// =============================================================================

import type { ParseResult, ValidationResult, ImportValidationError } from '../types';
import {
  createBlockedResult,
  type AmbiguousFrequencyActivity,
  type ImportPoaResult,
  type ZoneResolutionNeeded,
} from './types';

const FREQUENCY_DISCOVERY_DOC = 'docs/discovery/poa-frequency-per-zone.md';

/**
 * Devuelve null cuando la validación pasó (nada que bloquear). Cuando
 * validationResult.valid es false, errors[] nunca está vacío (por
 * construcción de validateParsedPoa), así que el resultado 'blocked' que
 * arma siempre cumple el invariante de createBlockedResult.
 */
export function buildBlockedResult(
  parseResult: ParseResult,
  validationResult: ValidationResult,
): Extract<ImportPoaResult, { status: 'blocked' }> | null {
  if (validationResult.valid) return null;

  const unresolvedZones: ZoneResolutionNeeded[] = [];
  const ambiguousFrequencyActivities: AmbiguousFrequencyActivity[] = [];
  const validationErrors: ImportValidationError[] = [];

  const seenZones = new Set<string>();
  const seenActivities = new Set<string>();

  for (const error of validationResult.errors) {
    if (error.code === 'zona_sin_mapeo' && error.zona) {
      if (!seenZones.has(error.zona)) {
        seenZones.add(error.zona);
        unresolvedZones.push({ excelZoneName: error.zona });
      }
      continue;
    }

    if (error.code === 'frecuencia_pendiente_regla_negocio' && error.activityKey && error.motivo) {
      if (!seenActivities.has(error.activityKey)) {
        seenActivities.add(error.activityKey);
        const actividad = parseResult.actividades.find((a) => a.activityKey === error.activityKey);
        ambiguousFrequencyActivities.push({
          activityKey: error.activityKey,
          descripcion: actividad?.descripcion ?? '',
          discoveryDoc: FREQUENCY_DISCOVERY_DOC,
          motivo: error.motivo,
        });
      }
      continue;
    }

    validationErrors.push(error);
  }

  return createBlockedResult({ unresolvedZones, ambiguousFrequencyActivities, validationErrors });
}
